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

function dobKindFor(meta: QtspMetaLike | undefined, country: string): { kind: DobKind; label: string } {
  if (!meta?.dobEncoding) {
    // Ukraine — Diia uses a custom OID under DSTU; explicitly absent
    // info for non-curated EU TSPs (no national-trust-list discovery
    // surface yet).
    return country === 'UA'
      ? { kind: 'absent', label: 'absent info' }
      : { kind: 'absent', label: 'absent info' };
  }
  const enc = meta.dobEncoding.toLowerCase();
  // ETSI EN 319 412-1 §natural-person attributes: dateOfBirth = 1.3.6.1.5.5.7.9.1
  // Anything else is a national-custom encoding.
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
      const dob = dobKindFor(meta, row.country);
      const state = meta?.state ?? 'unsupported';
      return { ...row, meta, dobKind: dob.kind, dobLabel: dob.label, state };
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
  const [supportedOnly, setSupportedOnly] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (countryFilter && r.country !== countryFilter) return false;
      if (p256Only && !r.p256) return false;
      if (supportedOnly && r.state === 'unsupported') return false;
      if (needle && !r.tspName.toLowerCase().includes(needle) && !r.country.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [allRows, q, countryFilter, p256Only, supportedOnly]);

  const supportedCount = allRows.filter((r) => r.state !== 'unsupported').length;
  const p256Count = allRows.filter((r) => r.p256).length;

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
            <span className="cv-pill is-eu">EU · {countries.filter((c) => c !== 'UA').length}</span>
            <span className="cv-pill is-ua">UA · 1</span>
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
                ECDSA secp256r1 (the curve zkqes verifies in-circuit) and how
                they encode date-of-birth in subject attributes.
                <br /><br />
                Status legend: <b style={{ color: '#2e7d32' }}>live</b> ready end-to-end ·
                <b style={{ color: 'var(--cv-ua-blue)' }}> gold</b> ceremony done, awaiting deploy ·
                <b style={{ color: '#a87b00' }}> silver</b> circuit shipped, ceremony pending ·
                <b style={{ color: 'var(--cv-mute)' }}> unsupported</b> in directory only.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <span className="cv-sticker">{supportedCount} on roadmap</span>
              <Link to="/integrations" className="cv-btn is-blue">↗ How to integrate</Link>
            </div>
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={supportedOnly} onChange={(e) => setSupportedOnly(e.target.checked)} />
              on roadmap only
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
                      {r.state === 'unsupported'
                        ? <span className="cv-pill" style={{ color: 'var(--cv-mute)' }}>—</span>
                        : r.meta
                          ? <Link to="/qtsp/$country/$qtsp" params={{ country: r.country.toLowerCase(), qtsp: r.meta.qtspSlug }} className="cv-pill is-ok" style={{ textDecoration: 'none' }}>
                              {r.state} ↗
                            </Link>
                          : <span className="cv-pill is-ok">{r.state}</span>}
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
          <FooterStat label="CAs flattened" value={String(QTSP_SUMMARY_META.totalCas)} yellow />
          <FooterStat label="P-256 capable" value={String(p256Count)} />
          <FooterStat label="snapshot" value={QTSP_SUMMARY_META.lotlSnapshot.slice(0, 10)} blue />
        </section>

        <p style={{ fontSize: 11, color: 'var(--cv-mute)', maxWidth: '90ch', lineHeight: 1.5 }}>
          ECDSA-P-256 detection is heuristic: a TSP is flagged supported when at least one CA in
          its chain advertises secp256r1 in its SPKI. It does NOT mean every leaf the TSP issues is
          P-256 — many TSPs issue both RSA and ECDSA leaves under the same chain. DOB-format column
          is curated against a small set of QTSPs (currently UA Diia's <code>1.2.804.2.1.1.1.11.1.4.11.1</code>);
          most rows show "absent info" until the per-country meta surface is filled in. Source of
          truth: trust-list snapshot {QTSP_SUMMARY_META.lotlSnapshot.slice(0, 10)} —
          {' '}<a href="https://eur-lex.europa.eu/eli/reg_impl/2015/1505/oj" rel="noopener noreferrer" className="cv-link">eIDAS Implementing Regulation 2015/1505</a>
          {' '}+ Ukraine's TL-EC (Article 15, Law 2155-VIII).
        </p>
      </div>
    </main>
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
