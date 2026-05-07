// QtspPage — `/qtsp/$country/$qtsp` Curve-2021 per-QTSP dossier.
//
// Header strip · about · signing tool · parser status · verified
// samples · trust anchors · state-driven CTA.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { QtspMeta } from '@zkqes/sdk';

import { TopBar } from '../components/curve/TopBar';
import { QTSP_INDEX } from '../generated/qtsp-index';
import { getQtspByPath } from '../lib/qtspIndex';
import { NOTIFY_STORAGE_PREFIX } from '../components/qtsp/QtspDrawer';

import '../styles/curve.css';

const REGION_DISPLAY: { of: (cc: string) => string | undefined } | undefined =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : undefined;

function countryName(cc: string): string {
  return REGION_DISPLAY?.of(cc) ?? cc;
}

function flagEmoji(cc: string): string {
  return [...cc]
    .map((c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)))
    .join('');
}

export interface QtspSample {
  id: string;
  sigAlg: string;
  verified: boolean;
  [k: string]: unknown;
}

const STATE_LABELS: Record<string, string> = {
  bronze: 'planned · pre-acceptance',
  silver: 'parser landed · awaiting samples',
  gold: 'verified on testnet',
  live: 'verified on mainnet',
};

const STATE_PILL: Record<string, string> = {
  bronze: '',
  silver: 'is-warn',
  gold: 'is-ua',
  live: 'is-ok',
};

export interface QtspPageViewProps {
  meta: QtspMeta;
  samples: readonly QtspSample[] | null;
  intermediates: readonly string[] | null;
}

export function QtspPageView({ meta, samples, intermediates }: QtspPageViewProps): JSX.Element {
  const qtspPathParam = `${meta.country}/${meta.qtspSlug}`;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="qtsp"
        statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● QTSP dossier</span>}
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>
        <Link to="/" hash="coverage" style={{
          fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-ua-blue)',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}>
          ← back to coverage grid
        </Link>

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">#</span>
            <span>QTSP DOSSIER · {countryName(meta.country)} · {meta.qtspSlug}</span>
            <span style={{ flex: 1 }} />
            <span className={`cv-pill ${meta.country === 'UA' ? 'is-ua' : ''}`}>{meta.country}</span>
            <span className={`cv-pill ${STATE_PILL[meta.state] ?? ''}`}>{meta.state.toUpperCase()}</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div style={{ fontSize: 80, lineHeight: 1 }} aria-label={countryName(meta.country)}>
              {flagEmoji(meta.country)}
            </div>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 88, lineHeight: .9 }}>
                {meta.displayName.toUpperCase()}<span className="b">.</span>
              </h1>
              <p style={{ maxWidth: 700, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
                {STATE_LABELS[meta.state] ?? meta.state} · {countryName(meta.country)} ({meta.country})
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              {meta.state === 'gold' || meta.state === 'live' ? (
                <Link to="/" search={{ qtsp: qtspPathParam }} className="cv-btn is-lg" style={{ minWidth: 220, justifyContent: 'center' }}>
                  ▶ {meta.state === 'live' ? 'Register' : 'Try on testnet'}
                </Link>
              ) : null}
              <a href={meta.signingTool.url} target="_blank" rel="noopener noreferrer"
                 className="cv-btn is-blue is-lg" style={{ minWidth: 220, justifyContent: 'center' }}>
                ↗ {meta.signingTool.name}
              </a>
            </div>
          </div>
        </section>

        {/* QUICK FACTS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className="dot live" />
              <span>SIGNING TOOL</span>
            </div>
            <div style={{ fontFamily: 'var(--cv-display)', fontSize: 26, color: 'var(--cv-ua-blue)' }}>
              {meta.signingTool.name}
            </div>
            {meta.signingTool.minVersion && (
              <div style={{ fontSize: 12, color: 'var(--cv-mute)', marginTop: 4 }}>
                requires version ≥ {meta.signingTool.minVersion}
              </div>
            )}
            <div className="cv-hatch" style={{ margin: '12px -16px' }} />
            <a href={meta.signingTool.url} target="_blank" rel="noopener noreferrer" className="cv-btn is-sm">
              ↗ visit
            </a>
          </div>

          <div className={`cv-card ${meta.state === 'live' ? 'is-blue' : meta.state === 'gold' ? 'is-yellow' : 'is-paper'}`}>
            <div className="cv-cardhead" style={meta.state === 'live' ? { color: '#fff' } : undefined}>
              <span className={`dot ${meta.state === 'live' || meta.state === 'gold' ? 'live' : ''}`} />
              <span>PARSER STATUS</span>
            </div>
            <div style={{ fontFamily: 'var(--cv-display)', fontSize: 26 }}>
              {meta.state.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: meta.state === 'live' ? 'var(--cv-ua-yellow)' : 'var(--cv-mute)', marginTop: 4, lineHeight: 1.45 }}>
              {STATE_LABELS[meta.state] ?? '—'}
            </div>
          </div>

          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className="dot live" />
              <span>COUNTRY</span>
            </div>
            <div style={{ fontFamily: 'var(--cv-display)', fontSize: 26, color: 'var(--cv-ua-blue)' }}>
              {countryName(meta.country)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cv-mute)', marginTop: 4 }}>
              ISO {meta.country} · trust list governs which QTSPs are accepted
            </div>
          </div>
        </section>

        {/* ABOUT */}
        {meta.notes && (
          <section className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className="cv-ix">§</span>
              <span>ABOUT</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{meta.notes}</p>
          </section>
        )}

        {/* SAMPLES + TRUST ANCHORS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          {/* Verified samples ledger */}
          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className="dot live" />
              <span>VERIFIED SAMPLES · ledger</span>
              <span style={{ flex: 1 }} />
              {samples !== null && <span className="cv-pill">{samples.length} entries</span>}
            </div>
            {samples === null ? (
              <div style={{ padding: '18px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
                No samples ledger published yet. Contributors can submit verified <code>.p7s</code> samples
                that confirm parser correctness against this QTSP's real outputs.
              </div>
            ) : samples.length === 0 ? (
              <div style={{ padding: '18px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
                No verified samples yet for this QTSP.
              </div>
            ) : (
              <table className="cv-table">
                <thead>
                  <tr><th>id</th><th>signature</th><th>verified</th></tr>
                </thead>
                <tbody>
                  {samples.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'var(--cv-mono)', fontSize: 11.5 }}>{s.id}</td>
                      <td style={{ color: 'var(--cv-mute)' }}>{s.sigAlg}</td>
                      <td>
                        <span className={`cv-pill ${s.verified ? 'is-ok' : 'is-err'}`}>
                          {s.verified ? '✓ verified' : '✗ failed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Trust anchors */}
          <div className="cv-card is-yellow">
            <div className="cv-cardhead">
              <span>TRUST ANCHORS · intermediate PEMs</span>
            </div>
            {intermediates === null ? (
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                <b>—</b>
                <br /><br />
                <span style={{ color: 'var(--cv-mute)' }}>
                  Trust-anchor manifest pending. The intermediates that chain from this QTSP up to
                  the EU LOTL root will be published here once the parser ledger lands.
                </span>
              </div>
            ) : intermediates.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--cv-mute)' }}>No intermediates published.</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {intermediates.map((name) => (
                  <li key={name} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, fontSize: 12, fontFamily: 'var(--cv-mono)' }}>
                    <span style={{ fontFamily: 'var(--cv-display)', fontSize: 18, color: 'var(--cv-ua-blue)' }}>▸</span>
                    <span style={{ wordBreak: 'break-all' }}>{name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* STATE-DRIVEN CTA */}
        {meta.state === 'silver' && <NotifyMeStrip meta={meta} />}

        {meta.state === 'gold' && (
          <section className="cv-card is-yellow" style={{ padding: '20px 24px' }}>
            <div className="cv-cardhead">
              <span className="cv-ix">▶</span>
              <span>READY ON TESTNET</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-blue">testnet · base sepolia</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                The {meta.displayName} parser has landed and verified against synthetic samples on Base Sepolia.
                Mint a real binding using your QES — testnet flow, no fees beyond gas.
              </div>
              <Link to="/" search={{ qtsp: qtspPathParam }}
                    className="cv-btn is-blue is-lg">▶ Try on testnet</Link>
            </div>
          </section>
        )}

        {meta.state === 'live' && (
          <section className="cv-card is-blue" style={{ padding: '20px 24px' }}>
            <div className="cv-cardhead" style={{ color: '#fff' }}>
              <span className="cv-ix">▶</span>
              <span>LIVE ON MAINNET</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-ok">live · base mainnet</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                {meta.displayName} is fully live. Bind your wallet to a qualified identity backed by this QTSP
                — every-day pseudonymity, recoverable accountability.
              </div>
              <Link to="/" search={{ qtsp: qtspPathParam }}
                    className="cv-btn" style={{ background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)', fontSize: 16, padding: '12px 20px' }}>
                ▶ Register
              </Link>
            </div>
          </section>
        )}

        {/* FOOTER STATS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="country" value={meta.country} suffix={countryName(meta.country)} />
          <FooterStat label="state" value={meta.state} suffix="phase" yellow />
          <FooterStat label="samples" value={samples ? String(samples.length) : '—'} suffix="verified" />
          <FooterStat label="qtsp slug" value={meta.qtspSlug} suffix="canonical" blue mono />
        </section>

      </div>
    </main>
  );
}

function NotifyMeStrip({ meta }: { meta: QtspMeta }) {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  const valid = email.includes('@');
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const key = `${NOTIFY_STORAGE_PREFIX}${meta.country}/${meta.qtspSlug}`;
    try {
      globalThis.localStorage?.setItem(
        key,
        JSON.stringify({ email, requestedAt: new Date().toISOString() }),
      );
      setSubmitted(true);
    } catch {
      // localStorage may be blocked
    }
  };

  return (
    <section className="cv-card is-yellow" style={{ padding: '20px 24px' }}>
      <div className="cv-cardhead">
        <span className="cv-ix">+</span>
        <span>NOTIFY ME WHEN READY</span>
        <span style={{ flex: 1 }} />
        <span className="cv-pill is-blue">parser landed · awaiting samples</span>
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: '0 0 12px' }}>
        The {meta.displayName} parser has landed. We need verified <code>.p7s</code> samples from real
        users to promote this QTSP to <b>gold</b>. Drop your email — we'll ping you when registration opens.
        Stored locally, in your browser only.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email — we ping you when ready"
          autoComplete="email"
          style={{
            padding: '12px 14px', border: '2px solid var(--cv-ink)',
            fontFamily: 'var(--cv-mono)', fontSize: 14, background: '#fff',
            boxShadow: 'inset 3px 3px 0 rgba(0,0,0,.06)',
          }}
        />
        <button type="submit" disabled={!valid} className="cv-btn is-blue is-lg"
                style={{ opacity: valid ? 1 : .5, cursor: valid ? 'pointer' : 'not-allowed' }}>
          {submitted ? '✓ saved' : '▶ Notify me'}
        </button>
      </form>
    </section>
  );
}

function FooterStat({ label, value, suffix, yellow, blue, mono }: {
  label: string; value: string; suffix?: string;
  yellow?: boolean; blue?: boolean; mono?: boolean;
}) {
  const cls = yellow ? 'is-yellow' : blue ? 'is-blue' : '';
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '10px 14px' }}>
      <div className="cv-cardhead" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>{label}</div>
      <div className="cv-num sm" style={{ ...(blue ? { color: 'var(--cv-ua-yellow)' } : {}), ...(mono ? { fontFamily: 'var(--cv-mono)', fontSize: 18 } : {}) }}>
        {value} {suffix && <span style={{ fontSize: 16 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ── Route wrapper ─────────────────────────────────────────────────

export default function QtspPage(): JSX.Element | null {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { country?: string; qtsp?: string };
  const path = `${params.country ?? ''}/${params.qtsp ?? ''}`;
  const meta = getQtspByPath(QTSP_INDEX, path);

  const shouldRedirect = !meta || meta.state === 'bronze';
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: '/countries', hash: 'coverage' });
    }
  }, [navigate, shouldRedirect]);

  const [samples, setSamples] = useState<readonly QtspSample[] | null>(null);
  const intermediates: readonly string[] | null = null;

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    void (async () => {
      const base = `/qtsp-data/${meta.country}/${meta.qtspSlug}`;
      try {
        const r = await fetch(`${base}/samples.json`);
        if (!cancelled && r.ok) {
          const json = (await r.json()) as QtspSample[];
          setSamples(json);
        }
      } catch {
        // silent — null sentinel covers the failure path
      }
    })();
    return () => { cancelled = true; };
  }, [meta]);

  if (shouldRedirect || !meta) return null;
  return <QtspPageView meta={meta} samples={samples} intermediates={intermediates} />;
}
