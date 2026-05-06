#!/usr/bin/env node
// Build-time: derive a per-QTSP summary from the live EU LOTL + UA TL-EC.
// When a national TL host is broken, geofenced, or has bad TLS from this
// machine, fall back to the Commission's DSS browser pages, and only then to
// the previously generated rows for that territory.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseLotl } from '../../lotl-flattener/dist/fetch/lotl.js';
import { parseMsTl } from '../../lotl-flattener/dist/fetch/msTl.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const OUT = resolve(ROOT, 'src/generated/qtsp-summary.ts');

const EU_LOTL_URL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';
const UA_TL_EC_URL = 'https://czo.gov.ua/download/tl/TL-UA-EC.xml';
const DSS_TL_INFO_URL = 'https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/tl-info';
const CURL_MAX_TIME_SECONDS = 45;
const CURL_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const SUPPORTED_TERRITORIES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IS',
  'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'UA',
]);

// OID 1.2.840.10045.3.1.7 = secp256r1 (NIST P-256).
// DER: 06 08 2A 86 48 CE 3D 03 01 07
const P256_OID_HEX = '06082a8648ce3d030107';
// OID 1.2.840.10045.2.1 = id-ecPublicKey
const EC_OID_HEX = '06072a8648ce3d0201';
// OID 1.2.840.113549.1.1.1 = rsaEncryption
const RSA_OID_HEX = '06092a864886f70d010101';

function detectKeyAlgs(certBytes) {
  const hex = Buffer.from(certBytes).toString('hex');
  const isP256 = hex.includes(P256_OID_HEX);
  const isEc = hex.includes(EC_OID_HEX);
  const isRsa = hex.includes(RSA_OID_HEX);
  return { isP256, isEc, isRsa };
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripTags(value) {
  return collapseWhitespace(value.replace(/<[^>]+>/g, ' '));
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseIsoTimestamp(xml) {
  const match = xml.match(/<ListIssueDateTime>([^<]+)<\/ListIssueDateTime>/i);
  return match?.[1] ?? null;
}

function parseDayMonthTimestamp(value) {
  const t = Date.parse(value);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return 0;
}

function curlFetchText(url, { insecure = false } = {}) {
  const args = [
    '-L',
    '--silent',
    '--show-error',
    '--max-time',
    String(CURL_MAX_TIME_SECONDS),
    '-A',
    CURL_USER_AGENT,
  ];
  if (insecure) args.push('-k');
  args.push('--output', '-', '--write-out', '\nCURL_STATUS:%{http_code}', url);

  try {
    const stdout = execFileSync('curl', args, {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
    const marker = '\nCURL_STATUS:';
    const idx = stdout.lastIndexOf(marker);
    if (idx === -1) {
      return { ok: false, status: 0, body: stdout, error: 'missing curl status marker' };
    }
    const body = stdout.slice(0, idx);
    const status = Number.parseInt(stdout.slice(idx + marker.length).trim(), 10) || 0;
    return { ok: status >= 200 && status < 300, status, body };
  } catch (error) {
    const body = typeof error?.stdout === 'string' ? error.stdout : '';
    return {
      ok: false,
      status: 0,
      body,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function fetchText(url, { allowInsecure = true } = {}) {
  const strict = curlFetchText(url, { insecure: false });
  if (strict.ok) return strict.body;
  if (!allowInsecure) {
    throw new Error(`fetch failed for ${url}: ${strict.status || strict.error || 'unknown error'}`);
  }
  const insecure = curlFetchText(url, { insecure: true });
  if (insecure.ok) return insecure.body;
  throw new Error(
    `fetch failed for ${url}: strict=${strict.status || strict.error || 'unknown'} insecure=${
      insecure.status || insecure.error || 'unknown'
    }`,
  );
}

function loadCachedRows() {
  if (!existsSync(OUT)) return [];
  const src = readFileSync(OUT, 'utf8');
  const match = src.match(
    /export const QTSP_SUMMARY:[\s\S]*?Object\.freeze\((\[[\s\S]*?\]) as const\);/,
  );
  if (!match) return [];
  try {
    const rows = JSON.parse(match[1]);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function buildCachedRowMap(rows) {
  const byCountry = new Map();
  for (const row of rows) {
    const key = String(row.country ?? '');
    if (!key) continue;
    let map = byCountry.get(key);
    if (!map) {
      map = new Map();
      byCountry.set(key, map);
    }
    map.set(normalizeName(String(row.tspName ?? '')), row);
  }
  return byCountry;
}

function aggregateRows(services) {
  const groups = new Map();

  for (const svc of services) {
    if (!svc.tspName || !svc.territory) continue;
    const key = `${svc.territory}|${svc.tspName}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        country: svc.territory,
        tspName: svc.tspName,
        serviceCount: 0,
        certFingerprints: new Set(),
        p256: false,
        hasEc: false,
        hasRsa: false,
        latestServiceFrom: 0,
      };
      groups.set(key, g);
    }
    g.serviceCount += 1;
    if (svc.statusStartingTime > g.latestServiceFrom) {
      g.latestServiceFrom = svc.statusStartingTime;
    }
    for (const certBytes of svc.x509CertificateList) {
      const fingerprint = Buffer.from(certBytes).toString('base64');
      if (g.certFingerprints.has(fingerprint)) continue;
      g.certFingerprints.add(fingerprint);
      const algs = detectKeyAlgs(certBytes);
      if (algs.isP256) g.p256 = true;
      if (algs.isEc) g.hasEc = true;
      if (algs.isRsa) g.hasRsa = true;
    }
  }

  return [...groups.values()].map((g) => ({
    country: g.country,
    tspName: g.tspName,
    certCount: g.certFingerprints.size,
    serviceCount: g.serviceCount,
    p256: g.p256,
    keyAlgs: [
      g.p256 ? 'ECDSA P-256' : null,
      g.hasEc && !g.p256 ? 'ECDSA (other)' : null,
      g.hasRsa ? 'RSA' : null,
    ].filter(Boolean),
    latestServiceFrom: g.latestServiceFrom,
  }));
}

function parseTlInfoIndex(html) {
  const entries = new Map();
  const rowRegex = /<tr class="tl-info-preview[\s\S]*?<\/tr>/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const block = match[0];
    const hrefMatch = block.match(/<a href="([^"]+)" class="tl-info-country" title="([A-Z]{2})">/);
    if (!hrefMatch) continue;
    const [, href, country] = hrefMatch;
    const numericCells = [...block.matchAll(/<td class="align-middle">(\d+)<\/td>/g)].map((m) =>
      Number.parseInt(m[1], 10),
    );
    const tspCount = numericCells.length >= 3 ? numericCells[numericCells.length - 3] : 0;
    entries.set(country, {
      detailUrl: new URL(href, DSS_TL_INFO_URL).toString(),
      tspCount,
    });
  }
  return entries;
}

function parseTlInfoFallbackRows(country, html, cachedRowsByCountry) {
  const rows = [];
  const headers = [];
  const headerRegex =
    /<div class="card-header[^"]*"[^>]*data-target="#(countryProviders\d+)"[\s\S]*?<span class="badge[^"]*"[^>]*>(\d+)<\/span>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = headerRegex.exec(html)) !== null) {
    headers.push({
      id: match[1],
      serviceCount: Number.parseInt(match[2], 10) || 0,
      headerHtml: match[3],
      bodyStart: html.indexOf(`id="${match[1]}"`, match.index),
    });
  }

  const cached = cachedRowsByCountry.get(country) ?? new Map();

  for (const [index, header] of headers.entries()) {
    const nextStart = headers[index + 1]?.bodyStart ?? html.length;
    const body = header.bodyStart === -1 ? '' : html.slice(header.bodyStart, nextStart);
    const tspName = decodeHtmlEntities(stripTags(header.headerHtml));
    if (!tspName) continue;

    const serials = new Set();
    const serialRegex = /<dt class="col-sm-3 m-0">Serial Number<\/dt>\s*<dd class="col-sm-9 m-0">([^<]+)<\/dd>/g;
    let serialMatch;
    while ((serialMatch = serialRegex.exec(body)) !== null) {
      serials.add(collapseWhitespace(decodeHtmlEntities(serialMatch[1])));
    }

    let latestServiceFrom = 0;
    const startRegex = /<dt class="col-sm-3 m-0">Start<\/dt>\s*<dd class="col-sm-9 m-0">([^<]+)<\/dd>/g;
    let startMatch;
    while ((startMatch = startRegex.exec(body)) !== null) {
      const ts = parseDayMonthTimestamp(decodeHtmlEntities(startMatch[1]));
      if (ts > latestServiceFrom) latestServiceFrom = ts;
    }

    const cachedRow = cached.get(normalizeName(tspName));
    rows.push({
      country,
      tspName,
      certCount: serials.size || cachedRow?.certCount || 0,
      serviceCount: header.serviceCount || cachedRow?.serviceCount || 0,
      p256: cachedRow?.p256 ?? false,
      keyAlgs: Array.isArray(cachedRow?.keyAlgs) ? cachedRow.keyAlgs : [],
      latestServiceFrom: latestServiceFrom || cachedRow?.latestServiceFrom || 0,
    });
  }

  return rows;
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => a.country.localeCompare(b.country) || a.tspName.localeCompare(b.tspName));
}

function summarizeCountrySourceLog(country, source, count, expectedCount) {
  const expected = Number.isFinite(expectedCount) && expectedCount > 0 ? ` / expected ${expectedCount}` : '';
  console.log(`qtsp-summary: ${country} via ${source} -> ${count} TSPs${expected}`);
}

const cachedRows = loadCachedRows();
const cachedRowsByCountry = buildCachedRowMap(cachedRows);

const lotlXml = fetchText(EU_LOTL_URL, { allowInsecure: false });
const lotlSnapshot = parseIsoTimestamp(lotlXml) ?? new Date().toISOString();
const lotlPointers = parseLotl(lotlXml).filter((p) => SUPPORTED_TERRITORIES.has(p.territory));
const tlInfoIndex = parseTlInfoIndex(fetchText(DSS_TL_INFO_URL, { allowInsecure: false }));

const territories = [...new Set([...lotlPointers.map((p) => p.territory), 'UA'])]
  .filter((cc) => SUPPORTED_TERRITORIES.has(cc))
  .sort();

const rowsByCountry = new Map();
const dssFallbackCountries = [];
const cachedFallbackCountries = [];

for (const country of territories) {
  const pointer = country === 'UA' ? { territory: 'UA', location: UA_TL_EC_URL } : lotlPointers.find((p) => p.territory === country);
  if (!pointer) {
    const cached = sortRows(cachedRows.filter((row) => row.country === country));
    if (cached.length > 0) {
      rowsByCountry.set(country, cached);
      cachedFallbackCountries.push(country);
      summarizeCountrySourceLog(country, 'cached(no-pointer)', cached.length, tlInfoIndex.get(country)?.tspCount);
    }
    continue;
  }

  let rows = [];
  try {
    const xml = fetchText(pointer.location, { allowInsecure: true });
    const currentServices = parseMsTl(xml).filter((svc) => svc.statusEndingTime === undefined);
    rows = sortRows(aggregateRows(currentServices));
    if (rows.length > 0) {
      rowsByCountry.set(country, rows);
      summarizeCountrySourceLog(country, 'xml', rows.length, tlInfoIndex.get(country)?.tspCount);
      continue;
    }
  } catch (error) {
    console.warn(`qtsp-summary: ${country} XML fetch/parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const tlInfo = tlInfoIndex.get(country);
  if (tlInfo) {
    try {
      const html = fetchText(tlInfo.detailUrl, { allowInsecure: false });
      rows = sortRows(parseTlInfoFallbackRows(country, html, cachedRowsByCountry));
      if (rows.length > 0) {
        rowsByCountry.set(country, rows);
        dssFallbackCountries.push(country);
        summarizeCountrySourceLog(country, 'dss-html', rows.length, tlInfo.tspCount);
        continue;
      }
    } catch (error) {
      console.warn(`qtsp-summary: ${country} DSS fallback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const cached = sortRows(cachedRows.filter((row) => row.country === country));
  if (cached.length > 0) {
    rowsByCountry.set(country, cached);
    cachedFallbackCountries.push(country);
    summarizeCountrySourceLog(country, 'cached', cached.length, tlInfo?.tspCount);
    continue;
  }

  console.warn(`qtsp-summary: ${country} unavailable and no cached rows exist`);
}

const rows = sortRows([...rowsByCountry.values()].flat());
const totalCerts = rows.reduce((sum, row) => sum + row.certCount, 0);
const p256Count = rows.filter((row) => row.p256).length;

const uaRows = rowsByCountry.get('UA') ?? [];
const uaLatestServiceFrom = uaRows.reduce((max, row) => Math.max(max, row.latestServiceFrom), 0);
const uaSnapshot = uaLatestServiceFrom > 0 ? new Date(uaLatestServiceFrom * 1000).toISOString() : null;

const out = `// AUTO-GENERATED by scripts/generate-qtsp-summary.mjs — do not edit by hand.
// Source of truth: live EU LOTL + UA TL-EC, with DSS/cached fallback for unreachable national TL hosts.

export interface QtspSummary {
  readonly country: string;
  readonly tspName: string;
  readonly certCount: number;
  readonly serviceCount: number;
  /** True when at least one current service certificate advertises secp256r1 (P-256). */
  readonly p256: boolean;
  readonly keyAlgs: ReadonlyArray<string>;
  readonly latestServiceFrom: number;
}

export const QTSP_SUMMARY: ReadonlyArray<QtspSummary> = Object.freeze(${JSON.stringify(rows, null, 2)} as const);

export const QTSP_SUMMARY_META = Object.freeze({
  lotlSnapshot: ${JSON.stringify(lotlSnapshot)},
  trustDomain: "EU_LOTL_PLUS_UA_TL_EC",
  trustSources: ${JSON.stringify([
    `eu-lotl:${lotlSnapshot.slice(0, 10)}`,
    ...(uaSnapshot ? [`ua-tl-ec:${uaSnapshot.slice(0, 10)}`] : ['ua-tl-ec:unknown']),
  ])},
  totalCas: ${totalCerts},
  totalTsps: ${rows.length},
  dssFallbackCountries: ${JSON.stringify(dssFallbackCountries)},
  cachedFallbackCountries: ${JSON.stringify(cachedFallbackCountries)},
});
`;

writeFileSync(OUT, out);

console.log(
  `qtsp-summary: emitted ${OUT} (${rows.length} TSPs, ${p256Count} with P-256, ${totalCerts} current certs)`,
);
