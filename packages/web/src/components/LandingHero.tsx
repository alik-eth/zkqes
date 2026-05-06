// zkqes.org root — Curve-2021 brutalist dashboard.
// Pre-launch posture: recruit Phase B ceremony contributors.
// No register flow — that lives at app.zkqes.org.

import { Link } from '@tanstack/react-router';
import { TopBar } from './curve/TopBar';
import { useCeremonyPhase } from '../hooks/useCeremonyPhase';
import { QTSP_INDEX } from '../generated/qtsp-index';
import { QTSP_SUMMARY, QTSP_SUMMARY_META } from '../generated/qtsp-summary';
import '../styles/curve.css';

function countByCountry(contributors: ReadonlyArray<{ name: string }>): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const c of contributors) {
    const m = c.name.match(/\(([A-Z]{2})\)/);
    const cc = m?.[1] ?? '?';
    map.set(cc, (map.get(cc) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function LandingHero() {
  const { phase, status } = useCeremonyPhase();
  const contributors = status?.contributors ?? [];
  const ceremonyCount = contributors.length;
  const byCountry = countByCountry(contributors);
  const empty = byCountry.length === 0;
  const maxByCountry = byCountry.reduce<number>((m, [, n]) => Math.max(m, n), 1);

  // QTSP directory: shown card lists the deploy-priority cohort —
  // every QTSP in the LOTL+UA snapshot whose chain advertises
  // ECDSA-P-256 (those drop into the existing circuit with no curve
  // change). Curated entries from QTSP_INDEX are flagged 'live'; the
  // rest are 'queued · P-256'. Source: src/generated/qtsp-summary.ts.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const curatedKey = (cc: string, name: string) => `${cc}|${norm(name)}`;
  const curatedSlugByKey = new Map<string, string>();
  for (const q of QTSP_INDEX) {
    curatedSlugByKey.set(curatedKey(q.country, q.displayName), q.qtspSlug);
  }
  const lookupCurated = (cc: string, tspName: string): string | undefined => {
    const tspNorm = norm(tspName);
    for (const [k, slug] of curatedSlugByKey) {
      const [keyCc, keyName] = k.split('|');
      if (keyCc === cc && (tspNorm.includes(keyName ?? '') || (keyName && (keyName).includes(tspNorm)))) {
        return slug;
      }
    }
    return undefined;
  };

  const p256Qtsps = QTSP_SUMMARY
    .filter((r) => r.p256)
    .map((r) => {
      const slug = lookupCurated(r.country, r.tspName);
      return { country: r.country, tspName: r.tspName, slug, live: !!slug };
    })
    .sort((a, b) => Number(b.live) - Number(a.live) || a.country.localeCompare(b.country) || a.tspName.localeCompare(b.tspName));
  const liveCount = p256Qtsps.filter((q) => q.live).length;
  const queuedCount = p256Qtsps.length - liveCount;
  const rsaCount = QTSP_SUMMARY_META.totalTsps - p256Qtsps.length;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar active="home" statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● phase 2 ceremony</span>} />
      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>

        {/* HERO STRIP — monumental */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">01</span>
            <span>ANONYMOUS QUALIFIED IDENTITY · eIDAS · UA DSP</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">UA · Diia</span>
            <span className="cv-pill is-eu">EU · {QTSP_SUMMARY_META.totalTsps - 1} listed</span>
            <span className={`cv-pill ${phase === 'live' ? 'is-ok' : 'is-warn'}`}>CEREMONY · {(phase ?? 'recruiting').toUpperCase()}</span>
            <div className="cv-stamp">QES<br />2026</div>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero">
                PROVE.<br />
                <span className="b">DON'T</span> <span className="y">REVEAL.</span>
              </h1>
              <p style={{ maxWidth: 680, fontSize: 14, marginTop: 18, lineHeight: 1.5 }}>
                A zero-knowledge proof of a qualified electronic signature.
                Bind any Ethereum wallet to a state-issued QES (Reg. EU 910/2014 ·
                UA 2155-VIII) without disclosing who signed. One identity →
                unlimited wallets, zero correlation.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <span className="cv-sticker">free · forever</span>
              <span className="cv-cta-wrap" data-desktop-only>
                <a href="https://app.zkqes.org" className="cv-btn is-lg">▶ Begin · 4 steps</a>
              </span>
              <Link to="/ceremony/contribute" className="cv-btn is-blue is-lg">↳ Help with the ceremony</Link>
              <span style={{ fontSize: 10.5, color: 'var(--cv-mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                phase 2 · trusted setup in progress
              </span>
            </div>
          </div>
        </section>

        {/* CEREMONY STRIP — the actual call to action */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 14 }}>
          <div className="cv-card is-blue">
            <div className="cv-cardhead" style={{ color: '#fff' }}>
              <span className="dot live" />
              <span>CEREMONY · phase 2 · BN254</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
              <div className="cv-num" style={{ color: 'var(--cv-ua-yellow)' }}>{ceremonyCount}</div>
              <div style={{ fontSize: 13, opacity: .85 }}>
                contribution{ceremonyCount === 1 ? '' : 's'} so far
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, fontSize: 11 }}>
              <Stat label="phase" value={phase ?? 'recruiting'} accent />
              <Stat label="countries" value={String(byCountry.length)} />
            </div>
            <div className="cv-hatch" style={{ margin: '12px -16px', borderColor: 'var(--cv-ua-yellow)' }} />
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              One honest contributor = the system stays sound.
              Run 5 commands on a machine you'll throw away.
            </div>
            <Link to="/ceremony/contribute" className="cv-btn" style={{ background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)' }}>
              ▶ Contribute now
            </Link>
          </div>

          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className={`dot ${empty ? '' : 'live'}`} />
              <span>CONTRIBUTORS · by country</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill">{empty ? '0 so far' : `${contributors.length} total`}</span>
            </div>
            {empty ? (
              <div style={{
                fontSize: 12, color: 'var(--cv-mute)', lineHeight: 1.5,
                padding: '24px 8px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--cv-display)', fontSize: 56, color: 'var(--cv-ink)', lineHeight: 1 }}>0</div>
                <div style={{ marginTop: 6 }}>contributions so far</div>
                <div style={{ marginTop: 10 }}>
                  Be the first. <Link to="/ceremony/contribute" className="cv-link">Run the ceremony →</Link>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                {byCountry.map(([c, n]) => (
                  <div key={c} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 30px', gap: 8, alignItems: 'center' }}>
                    <span className={`cv-pill ${c === 'UA' ? 'is-ua' : ''}`}>{c}</span>
                    <div style={{ height: 14, border: '2px solid var(--cv-ink)', background: '#fff' }}>
                      <div style={{
                        height: '100%',
                        width: `${(n / maxByCountry) * 100}%`,
                        background: c === 'UA' ? 'var(--cv-ua-yellow)' : 'var(--cv-ua-blue)',
                      }} />
                    </div>
                    <b style={{ textAlign: 'right', fontFamily: 'var(--cv-display)', fontSize: 18 }}>{n}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="cv-hatch" style={{ margin: '12px -16px' }} />
            <div style={{ fontSize: 11, color: 'var(--cv-mute)' }}>
              "1-of-N honest" soundness — geographic diversity ↑ adversarial coordination ↓.
            </div>
          </div>

          <div className="cv-card is-yellow">
            <div className="cv-cardhead">
              <span>STATUS · live ceremony chain</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              Every contribution is hashed into an append-only chain.
              Every hash is independently verifiable; every contributor
              attested. The chain is the ceremony.
            </div>
            <div className="cv-hatch" style={{ margin: '14px -16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5 }}>
              <Stat label="last attest" value="14:22" />
              <Stat label="parent hash" value="9f81…" mono />
              <Stat label="ipfs" value="pinned" />
              <Stat label="status" value="✓ all verified" />
            </div>
            <Link to="/ceremony" className="cv-btn is-blue" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
              ↗ View full chain
            </Link>
          </div>
        </section>

        {/* THREE WAYS TO CONTRIBUTE */}
        <h2 style={{
          fontFamily: 'var(--cv-display)', fontSize: 48, lineHeight: 1, margin: '12px 0 0',
        }}>
          THREE WAYS TO CONTRIBUTE.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '60ch', margin: 0 }}>
          Bring your own machine, rent one, or click a button. Pick the one
          that's least friction. Any single honest contributor secures the
          ceremony for everyone.
        </p>

        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <PathCard
            n="01"
            label="Local snarkjs"
            time="~25 min"
            req="38 GB RAM"
            cost="free"
            body="For contributors with a 38 GB-RAM machine. Five commands, twenty-five minutes wall-clock. Snarkjs holds the intermediate zkey in V8 heap; ~38 GB peak. Bring your own entropy source."
            cta="Read the snarkjs runbook"
            accent="paper"
          />
          <PathCard
            n="02"
            label="Rented VPS"
            time="~25 min"
            req="any 38 GB Linux"
            cost="≈ €0.20"
            body="No local infra? Hetzner CCX43 (48 GB, 16 vCPU, ~€0.20/hr) — or any 38 GB+ Linux box — runs the same snarkjs commands. Spin up, run, attest, destroy."
            cta="Same commands, any host"
            accent="yellow"
          />
          <PathCard
            n="03"
            label="Fly.io launcher"
            time="~25 min"
            req="just a Fly token"
            cost="≈ $0.40"
            body="For everyone else. One form, your handle, your Fly token; we boot a 48 GB performance-4x machine, run snarkjs against the latest round, attest, and tear it down. Fly's free tier covers it."
            cta="Open the Fly launcher"
            accent="blue"
          />
        </section>

        {/* QTSP DIRECTORY + ABOUT */}
        <section id="coverage" className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, scrollMarginTop: 80 }}>
          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className="dot live" />
              <span>QTSP DIRECTORY · ECDSA P-256 · ships first</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-ok">{liveCount} live</span>
              <span className="cv-pill">{queuedCount} queued</span>
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '2px solid var(--cv-ink)', background: '#fff' }}>
              {p256Qtsps.map((q) => {
                const row = (
                  <>
                    <span className={`cv-pill ${q.country === 'UA' ? 'is-ua' : ''}`}>{q.country}</span>
                    <span style={{ fontWeight: 500 }}>{q.tspName}</span>
                    <span className={`cv-pill ${q.live ? 'is-ok' : ''}`} style={{ fontSize: 9.5 }}>
                      {q.live ? 'live' : 'queued · P-256'}
                    </span>
                  </>
                );
                const baseStyle: React.CSSProperties = {
                  display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 8,
                  padding: '6px 8px', borderBottom: '1px dashed rgba(0,0,0,.2)',
                  alignItems: 'center', fontSize: 12,
                  color: q.live ? 'var(--cv-ink)' : 'var(--cv-mute)', textDecoration: 'none',
                };
                if (q.live && q.slug) {
                  return (
                    <Link
                      key={`${q.country}|${q.tspName}`}
                      to="/qtsp/$country/$qtsp"
                      params={{ country: q.country.toLowerCase(), qtsp: q.slug }}
                      style={baseStyle}
                    >
                      {row}
                    </Link>
                  );
                }
                return (
                  <div key={`${q.country}|${q.tspName}`} style={baseStyle}>{row}</div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--cv-mute)' }}>
                {p256Qtsps.length} P-256 · {rsaCount} RSA queued behind separate verifier
              </span>
              <span style={{ flex: 1 }} />
              <Link to="/qtsps" className="cv-btn is-sm is-ghost">view all {QTSP_SUMMARY_META.totalTsps} ↗</Link>
            </div>
          </div>

          <div className="cv-card is-blue">
            <div className="cv-cardhead" style={{ color: '#fff' }}>
              <span>ABOUT · zkqes</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>
              zkqes surfaces a property of every state-issued credential —
              that the issuing authority retains the ability to identify a
              holder under lawful process — onto the chain.
              <br /><br />
              Everyday <b style={{ color: 'var(--cv-ua-yellow)' }}>pseudonymity</b> for the holder.
              Recoverable <b style={{ color: 'var(--cv-ua-yellow)' }}>accountability</b> for the state.
              The same trust structure as the QES itself.
            </div>
            <div className="cv-hatch" style={{ margin: '14px -16px', borderColor: 'var(--cv-ua-yellow)' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="https://docs.zkqes.org" rel="noopener noreferrer" className="cv-btn" style={{ background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)' }}>
                ↗ docs.zkqes.org
              </a>
              <a href="https://github.com/alik-eth/zkqes" rel="noopener noreferrer" className="cv-btn is-ghost" style={{ color: '#fff', borderColor: '#fff' }}>
                ↗ github
              </a>
            </div>
          </div>
        </section>

        {/* FOOTER STATS STRIP */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="proof size" value="~20" suffix="KB" />
          <FooterStat label="verify gas" value="~230" suffix="k" yellow />
          <FooterStat label="signature" value="ECDSA" suffix="P-256" />
          <FooterStat label="constraints" value="~10.8" suffix="M (leaf+chain)" />
          <FooterStat label="audit" value="2026-Q3" suffix="planned" blue />
        </section>

      </div>
    </main>
  );
}

function Stat({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div>
      <div style={{ opacity: .7, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <b style={{
        fontFamily: mono ? 'var(--cv-mono)' : 'var(--cv-display)',
        fontSize: mono ? 14 : 22,
        color: accent ? 'var(--cv-ua-yellow)' : undefined,
      }}>{value}</b>
    </div>
  );
}

function PathCard({ n, label, time, req, cost, body, cta, accent }: {
  n: string; label: string; time: string; req: string; cost: string;
  body: string; cta: string;
  accent: 'paper' | 'yellow' | 'blue';
}) {
  const isBlue = accent === 'blue';
  return (
    <div className={`cv-card ${accent === 'paper' ? 'is-paper' : accent === 'yellow' ? 'is-yellow' : 'is-blue'}`}>
      <div className="cv-cardhead" style={isBlue ? { color: '#fff' } : undefined}>
        <span className="cv-ix">{n}</span>
        <span>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="cv-pill">⏱ {time}</span>
        <span className="cv-pill">⊞ {req}</span>
        <span className={`cv-pill ${cost === 'free' ? 'is-ok' : ''}`}>$ {cost}</span>
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>{body}</p>
      <div className="cv-hatch" style={{ margin: '14px -16px', ...(isBlue ? { borderColor: 'var(--cv-ua-yellow)' } : {}) }} />
      <Link
        to="/ceremony/contribute"
        className={`cv-btn ${accent === 'yellow' ? 'is-blue' : ''}`}
        style={isBlue ? { background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)' } : undefined}
      >
        ▶ {cta}
      </Link>
    </div>
  );
}

function FooterStat({ label, value, suffix, yellow, blue }: {
  label: string; value: string; suffix?: string; yellow?: boolean; blue?: boolean;
}) {
  const cls = yellow ? 'is-yellow' : blue ? 'is-blue' : '';
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '10px 14px' }}>
      <div className="cv-cardhead" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>{label}</div>
      <div className="cv-num sm" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>
        {value} {suffix && <span style={{ fontSize: 18 }}>{suffix}</span>}
      </div>
    </div>
  );
}

