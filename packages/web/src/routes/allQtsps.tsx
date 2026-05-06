// /qtsps — full QTSP directory: every TSP from EU LOTL + UA TL-EC,
// joined against curated meta (DOB encoding, support state) where
// available. Country, name, ECDSA-P256 support, DOB format columns
// per founder spec 2026-05-06.

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';

import { TopBar } from '../components/curve/TopBar';
import { QTSP_SUMMARY, QTSP_SUMMARY_META, type QtspSummary } from '../generated/qtsp-summary';
import { QTSP_INDEX } from '../generated/qtsp-index';
import '../styles/curve.css';

interface QtspMetaLike { country: string; qtspSlug: string; displayName: string; dobEncoding?: string; state?: string }

// Heuristic match between LOTL tspName and a curated QTSP_INDEX entry.
// We compare by country + a normalized name token.
function findCuratedMeta(row: QtspSummary): QtspMetaLike | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const tspNorm = norm(row.tspName);
  return (QTSP_INDEX as ReadonlyArray<QtspMetaLike>).find((q) =>
    q.country === row.country &&
    (tspNorm.includes(norm(q.displayName)) || tspNorm.includes(norm(q.qtspSlug))),
  );
}

type DobKind = 'standard' | 'custom' | 'absent';

function dobKindFor(meta: QtspMetaLike | undefined): { kind: DobKind; label: string } {
  if (!meta?.dobEncoding) {
    return { kind: 'absent', label: 'absent info' };
  }
  // ETSI EN 319 412-1 §natural-person attributes: dateOfBirth = 1.3.6.1.5.5.7.9.1.
  // Anything else is a national-custom encoding.
  const enc = meta.dobEncoding.toLowerCase();
  if (enc === 'etsi' || enc.startsWith('rfc') || enc === 'standard') {
    return { kind: 'standard', label: 'standard (ETSI)' };
  }
  return { kind: 'custom', label: `custom (${meta.dobEncoding})` };
}

const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia',
  DE: 'Germany', DK: 'Denmark', EE: 'Estonia', EL: 'Greece', ES: 'Spain',
  FI: 'Finland', FR: 'France', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland',
  IS: 'Iceland', IT: 'Italy', LI: 'Liechtenstein', LT: 'Lithuania',
  LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta', NL: 'Netherlands', NO: 'Norway',
  PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden', SI: 'Slovenia',
  SK: 'Slovakia', UA: 'Ukraine',
};

// Stylized tile-map of EU + Ukraine. (col, row) coordinates for each
// supported territory — geographic-ish, not cartographically accurate.
// Schematic on purpose: every country gets the same tile size so small
// states (LU, MT, LI) read at the same weight as DE/FR. Grid origin
// is top-left.
const TILE_POS: Record<string, readonly [number, number]> = {
  IS: [0, 0],
  NO: [9, 0], SE: [10, 0], FI: [11, 0],
  IE: [4, 1], NL: [8, 1], DK: [9, 1], EE: [11, 1],
  LU: [8, 2], DE: [9, 2], LV: [11, 2], LT: [12, 2],
  PT: [4, 3], FR: [7, 3], BE: [8, 3], PL: [11, 3], UA: [14, 3],
  ES: [5, 4], LI: [9, 4], AT: [10, 4], CZ: [11, 4], SK: [12, 4], HU: [13, 4], RO: [14, 4],
  IT: [9, 5], SI: [10, 5], HR: [11, 5], BG: [13, 5],
  MT: [11, 6], EL: [13, 6], CY: [14, 6],
};
const TILE_SIZE = 52;
const TILE_GAP = 4;
const TILE_COLS = 16;
const TILE_ROWS = 7;

interface DirectoryRow extends QtspSummary {
  meta: QtspMetaLike | undefined;
  dobKind: DobKind;
  dobLabel: string;
  state: string;
}

export function AllQtspsScreen() {
  const allRows: ReadonlyArray<DirectoryRow> = useMemo(() => {
    return QTSP_SUMMARY.map((row) => {
      const meta = findCuratedMeta(row);
      const dob = dobKindFor(meta);
      const state = meta?.state ?? 'queued';
      return { ...row, meta, dobKind: dob.kind, dobLabel: dob.label, state };
    }).slice().sort((a, b) => {
      // ECDSA-P-256 capable QTSPs come first — that's deploy priority.
      if (a.p256 !== b.p256) return a.p256 ? -1 : 1;
      return a.country.localeCompare(b.country) || a.tspName.localeCompare(b.tspName);
    });
  }, []);

  const countries = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) s.add(r.country);
    return [...s].sort();
  }, [allRows]);

  const [q, setQ] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [p256Only, setP256Only] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (countryFilter && r.country !== countryFilter) return false;
      if (p256Only && !r.p256) return false;
      if (needle && !r.tspName.toLowerCase().includes(needle) && !r.country.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [allRows, q, countryFilter, p256Only]);

  const p256Count = allRows.filter((r) => r.p256).length;
  const uaCount = allRows.filter((r) => r.country === 'UA').length;
  const euCount = allRows.length - uaCount;

  // Per-country aggregates for the tile-map. Keyed by country code.
  const byCountry = useMemo(() => {
    const m = new Map<string, { total: number; p256: number; live: number }>();
    for (const r of allRows) {
      const e = m.get(r.country) ?? { total: 0, p256: 0, live: 0 };
      e.total += 1;
      if (r.p256) e.p256 += 1;
      if (r.meta) e.live += 1;
      m.set(r.country, e);
    }
    return m;
  }, [allRows]);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="qtsp"
        statusPill={
          <span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>
            ● {QTSP_SUMMARY_META.totalTsps} QTSPs · {countries.length} countries
          </span>
        }
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>
        <Link to="/" style={{
          fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-ua-blue)',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}>
          ← back
        </Link>

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">▦</span>
            <span>QTSP DIRECTORY · EU LOTL + UA TL-EC · {QTSP_SUMMARY_META.totalTsps} listed</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-eu">EU · {euCount}</span>
            <span className="cv-pill is-ua">UA · {uaCount}</span>
            <span className="cv-pill is-ok">{p256Count} support P-256</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 96 }}>
                EVERY <span className="b">QTSP.</span><br />
                <span className="y">ONE LIST.</span>
              </h1>
              <p style={{ maxWidth: 720, fontSize: 13.5, marginTop: 16, lineHeight: 1.5 }}>
                {QTSP_SUMMARY_META.totalTsps} qualified trust-service providers across {countries.length} countries —
                every entry on the EU List-of-Trusted-Lists snapshot
                ({QTSP_SUMMARY_META.lotlSnapshot.slice(0, 10)}) plus Ukraine's TL-EC.
                Each row shows whether at least one of the TSP's CAs advertises
                ECDSA secp256r1 (verified on-chain via EIP-7212 P256Verify, not
                in-circuit) and how they encode date-of-birth in subject attributes.
                <br /><br />
                Every QTSP listed here is on the roadmap. We're shipping
                <b> ECDSA-P-256 capable QTSPs first</b> ({p256Count} of {QTSP_SUMMARY_META.totalTsps}) — those
                roll into the existing circuit with no curve change. RSA-only
                QTSPs need a separate verifier; they queue behind the P-256 wave.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <span className="cv-sticker">{p256Count} ship first</span>
              <Link to="/integrations" className="cv-btn is-blue">↗ How to integrate</Link>
            </div>
          </div>
        </section>

        {/* MAP · EU + Ukraine tile grid */}
        <section className="cv-card is-paper" style={{ padding: '14px 16px' }}>
          <div className="cv-cardhead">
            <span className="cv-ix">▥</span>
            <span>MAP · EU + UA · click a tile to filter</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ok">P-256 · ships first</span>
            <span className="cv-pill" style={{ background: 'var(--cv-card)' }}>RSA · queued</span>
            {countryFilter && (
              <button onClick={() => setCountryFilter('')} className="cv-btn is-sm is-ghost">
                ✕ clear {countryFilter}
              </button>
            )}
          </div>
          <div style={{ overflow: 'auto' }}>
            <svg
              viewBox={`0 0 ${TILE_COLS * (TILE_SIZE + TILE_GAP)} ${TILE_ROWS * (TILE_SIZE + TILE_GAP) + 4}`}
              width="100%"
              style={{ minWidth: 700, display: 'block' }}
              role="img"
              aria-label="EU + Ukraine QTSP coverage map"
            >
              {Object.entries(TILE_POS).map(([cc, pos]) => {
                const [col, row] = pos;
                const x = col * (TILE_SIZE + TILE_GAP);
                const y = row * (TILE_SIZE + TILE_GAP);
                const agg = byCountry.get(cc) ?? { total: 0, p256: 0, live: 0 };
                const isUA = cc === 'UA';
                const isSelected = countryFilter === cc;
                const hasAny = agg.total > 0;
                const hasP256 = agg.p256 > 0;
                const hasLive = agg.live > 0;
                // Fill: live=UA-blue · P-256=UA-yellow · RSA-only=paper · empty=very faint
                const fill = !hasAny
                  ? '#e8e2d2'
                  : hasLive
                    ? 'var(--cv-ua-blue)'
                    : hasP256
                      ? 'var(--cv-ua-yellow)'
                      : 'var(--cv-card)';
                const stroke = isSelected ? 'var(--cv-ua-blue)' : 'var(--cv-ink)';
                const strokeWidth = isSelected ? 4 : 2;
                const textColor = hasLive ? '#fff' : 'var(--cv-ink)';
                const subColor = hasLive ? 'var(--cv-ua-yellow)' : 'var(--cv-mute)';
                return (
                  <g
                    key={cc}
                    transform={`translate(${x}, ${y})`}
                    style={{ cursor: hasAny ? 'pointer' : 'default' }}
                    onClick={() => hasAny && setCountryFilter(isSelected ? '' : cc)}
                  >
                    <title>{`${COUNTRY_NAMES[cc] ?? cc} · ${agg.total} QTSPs · ${agg.p256} P-256${hasLive ? ' · live integration' : ''}`}</title>
                    <rect
                      width={TILE_SIZE} height={TILE_SIZE}
                      fill={fill} stroke={stroke} strokeWidth={strokeWidth}
                    />
                    {/* UA flag stripes corner */}
                    {isUA && (
                      <>
                        <rect x={TILE_SIZE - 12} y={0} width={12} height={6} fill="#0057B7" />
                        <rect x={TILE_SIZE - 12} y={6} width={12} height={6} fill="#FFD700" />
                      </>
                    )}
                    {/* country code */}
                    <text
                      x={TILE_SIZE / 2} y={TILE_SIZE / 2 - 2}
                      textAnchor="middle"
                      fontFamily="var(--cv-display)"
                      fontSize="22"
                      fill={textColor}
                      fontWeight="bold"
                    >
                      {cc}
                    </text>
                    {/* count badge */}
                    <text
                      x={TILE_SIZE / 2} y={TILE_SIZE - 8}
                      textAnchor="middle"
                      fontFamily="var(--cv-mono)"
                      fontSize="9.5"
                      fill={subColor}
                      letterSpacing="0.5"
                    >
                      {agg.total}{hasP256 ? ` · ${agg.p256}P` : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--cv-mute)' }}>
            <Legend swatch="var(--cv-ua-blue)" label="live integration (curated)" />
            <Legend swatch="var(--cv-ua-yellow)" label="ECDSA P-256 · ships first" />
            <Legend swatch="var(--cv-card)" label="RSA-only · queued" />
            <Legend swatch="#e8e2d2" label="not in supported set" />
            <span style={{ flex: 1 }} />
            <span style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>
              digit pair = total · P-256 capable
            </span>
          </div>
        </section>

        {/* FILTER STRIP */}
        <section className="cv-card is-paper" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="search name or country…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                flex: '2 1 220px', minWidth: 180, fontFamily: 'var(--cv-mono)', fontSize: 13,
                padding: '6px 10px', border: '2px solid var(--cv-ink)', background: '#fff',
              }}
            />
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              style={{
                fontFamily: 'var(--cv-mono)', fontSize: 13,
                padding: '6px 10px', border: '2px solid var(--cv-ink)', background: '#fff',
              }}
            >
              <option value="">all countries</option>
              {countries.map((cc) => (
                <option key={cc} value={cc}>{cc} · {COUNTRY_NAMES[cc] ?? cc}</option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={p256Only} onChange={(e) => setP256Only(e.target.checked)} />
              ECDSA P-256 only
            </label>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--cv-mute)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {rows.length} / {allRows.length} shown
            </span>
          </div>
        </section>

        {/* DIRECTORY TABLE */}
        <section className="cv-card is-paper" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <table className="cv-table" style={{ minWidth: 720 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--cv-card)', zIndex: 1 }}>
                <tr>
                  <th>cc</th>
                  <th>QTSP</th>
                  <th>certs · services</th>
                  <th>ECDSA P-256</th>
                  <th>DOB format</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.country}|${r.tspName}`}>
                    <td><span className={`cv-pill ${r.country === 'UA' ? 'is-ua' : ''}`}>{r.country}</span></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.tspName}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--cv-mute)' }}>
                        {COUNTRY_NAMES[r.country] ?? r.country}
                        {r.keyAlgs.length > 0 && ` · ${r.keyAlgs.join(' / ')}`}
                      </div>
                    </td>
                    <td style={{ color: 'var(--cv-mute)', fontSize: 11.5 }}>
                      {r.certCount} · {r.serviceCount}
                    </td>
                    <td>
                      {r.p256
                        ? <span className="cv-pill is-ok">✓ supported</span>
                        : <span className="cv-pill" style={{ color: 'var(--cv-mute)' }}>—</span>}
                    </td>
                    <td>
                      {r.dobKind === 'custom'
                        ? <span className="cv-pill is-warn">{r.dobLabel}</span>
                        : r.dobKind === 'standard'
                          ? <span className="cv-pill is-ok">{r.dobLabel}</span>
                          : <span className="cv-pill" style={{ color: 'var(--cv-mute)' }}>{r.dobLabel}</span>}
                    </td>
                    <td>
                      {r.meta
                        ? <Link to="/qtsp/$country/$qtsp" params={{ country: r.country.toLowerCase(), qtsp: r.meta.qtspSlug }} className="cv-pill is-ok" style={{ textDecoration: 'none' }}>
                            {r.state} ↗
                          </Link>
                        : <span className="cv-pill" style={{ background: r.p256 ? 'var(--cv-ok)' : 'transparent', color: r.p256 ? 'var(--cv-ink)' : 'var(--cv-mute)' }}>
                            {r.p256 ? 'queued · P-256' : 'queued · RSA'}
                          </span>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--cv-mute)' }}>
                    no matches — broaden the filters
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* META FOOTER */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="QTSPs" value={String(QTSP_SUMMARY_META.totalTsps)} />
          <FooterStat label="current certs" value={String(QTSP_SUMMARY_META.totalCas)} yellow />
          <FooterStat label="P-256 capable" value={String(p256Count)} />
          <FooterStat label="EU snapshot" value={QTSP_SUMMARY_META.lotlSnapshot.slice(0, 10)} blue />
        </section>

        <p style={{ fontSize: 11, color: 'var(--cv-mute)', maxWidth: '90ch', lineHeight: 1.5 }}>
          ECDSA-P-256 detection is heuristic: a TSP is flagged supported when at least one CA in
          its chain advertises secp256r1 in its SPKI. It does NOT mean every leaf the TSP issues is
          P-256 — many TSPs issue both RSA and ECDSA leaves under the same chain. DOB-format column
          is curated against a small set of QTSPs (currently UA Diia's <code>1.2.804.2.1.1.1.11.1.4.11.1</code>);
          most rows show "absent info" until the per-country meta surface is filled in. Source of
          truth: live trust-list snapshots ({QTSP_SUMMARY_META.trustSources.join(' · ')}) —
          {' '}<a href="https://eur-lex.europa.eu/eli/reg_impl/2015/1505/oj" rel="noopener noreferrer" className="cv-link">eIDAS Implementing Regulation 2015/1505</a>
          {' '}+ Ukraine's TL-EC (Article 15, Law 2155-VIII). Where a national TL host is
          temporarily unreachable from the build environment, rows fall back to the
          DSS browser export or the previous successful snapshot — see
          dssFallbackCountries / cachedFallbackCountries in QTSP_SUMMARY_META.
        </p>
      </div>
    </main>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 14, height: 14, background: swatch, border: '2px solid var(--cv-ink)',
        display: 'inline-block',
      }} />
      {label}
    </span>
  );
}

function FooterStat({ label, value, yellow, blue }: {
  label: string; value: string; yellow?: boolean; blue?: boolean;
}) {
  const cls = yellow ? 'is-yellow' : blue ? 'is-blue' : '';
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '10px 14px' }}>
      <div className="cv-cardhead" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>{label}</div>
      <div className="cv-num sm" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default AllQtspsScreen;
