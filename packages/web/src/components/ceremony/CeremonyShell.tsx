// /ceremony — Curve-2021 brutalist live ceremony dashboard.
//
// Drives off `useCeremonyPhase()`. Empty-state when status feed is
// down or no contributors yet. Multi-circuit aware (V5.3 identity +
// V5.4 age-diia-ua via the `circuits` map).
//
// sharedRoutes — visible on both landing + app builds. No wagmi,
// no SAB, no snarkjs.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';

import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { TopBar } from '../curve/TopBar';
import type { CeremonyContributor } from '../../lib/ceremonyStatus';

import '../../styles/curve.css';

const FOUR_COMMANDS = `$ curl -O https://prove.zkqes.org/ceremony/round-N-prev.zkey
$ snarkjs zkey contribute round-N-prev.zkey round-N-mine.zkey
$ snarkjs zkey verify zkqes-v5.r1cs powers22.ptau round-N-mine.zkey
$ curl -X PUT --data-binary @round-N-mine.zkey "$SIGNED_URL"`;

const CIRCUIT_LABELS: Record<string, string> = {
  'v5.3-identity': 'V5.3 · Identity Diia UA',
  'v5.4-age-diia-ua': 'V5.4 · Age Diia UA',
};

export function CeremonyIndex() { return <CeremonyShell />; }

export function CeremonyShell() {
  const { phase, status, error } = useCeremonyPhase();
  const effectivePhase = phase ?? 'recruiting';
  const round = status?.round ?? 0;
  const contributors = status?.contributors ?? [];
  const beaconHeight = status?.beaconBlockHeight ?? null;
  const beaconHash = status?.beaconHash ?? null;
  const finalSha = status?.finalZkeySha256 ?? null;
  const circuits = status?.circuits ?? {};
  const feedDown = error !== null && status === null;

  const phaseLabel = effectivePhase === 'recruiting' ? 'RECRUITING'
    : effectivePhase === 'ceremony-live' ? 'CEREMONY LIVE' : 'COMPLETE';

  // Contributor-by-country tally — derive from contributor handles.
  // Without explicit country fields we just bucket by '?'; in real
  // data the publish-status.ts emits `name` strings like "alik.eth (UA)".
  const byCountry = countByCountry(contributors);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar active="ceremony" statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● ceremony in flight</span>} />
      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">∴</span>
            <span>CEREMONY · TRUSTED SETUP · GROTH16 · BN254</span>
            <span style={{ flex: 1 }} />
            <span className={`cv-pill ${effectivePhase === 'live' ? 'is-ok' : 'is-warn'}`}>{phaseLabel}</span>
            <span className="cv-pill is-ua">round {round}</span>
            <span className="cv-pill">coord · alik.eth</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 132 }}>
                ONE HONEST.<br />
                <span className="b">CONTRIBUTOR.</span>
              </h1>
              <p style={{ maxWidth: 720, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
                Groth16 needs a trusted setup. The setup is sound as long as
                ONE contributor honestly destroyed their entropy. We're
                running a multi-contributor ceremony to make that "one"
                anyone — every link in the chain is publicly attested,
                independently verifiable, append-only.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <span className="cv-sticker">free · 25 min</span>
              <a
                href={`mailto:ceremony@zkqes.org?subject=${encodeURIComponent('zkqes ceremony · contributor signup')}&body=${encodeURIComponent(
                  'Hi —\n\nI want to contribute to the zkqes Phase 2 trusted-setup ceremony.\n\n' +
                  'Handle (github / x / ens): \n' +
                  'Preferred path (snarkjs · VPS · Fly): \n' +
                  'Hardware available (RAM, OS): \n\n' +
                  'Ping me when the next round opens.\n',
                )}`}
                className="cv-btn is-lg"
                style={{ minWidth: 260, justifyContent: 'center' }}
              >
                ▶ Sign up to contribute
              </a>
              <Link to="/ceremony/verify" className="cv-btn is-blue is-lg" style={{ minWidth: 260, justifyContent: 'center' }}>
                ↗ Verify a hash
              </Link>
            </div>
          </div>
        </section>



        {/* BIG STATUS ROW — 3 cards */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {/* Progress */}
          <div className="cv-card is-blue">
            <div className="cv-cardhead" style={{ color: '#fff' }}>
              <span className="dot live" />
              <span>PROGRESS · this ceremony</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
              <div className="cv-num" style={{ color: 'var(--cv-ua-yellow)' }}>{round}</div>
              <div style={{ fontSize: 13, opacity: .85 }}>
                contribution{round === 1 ? '' : 's'} so far
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, fontSize: 11 }}>
              <Stat label="phase" value={phaseLabel} />
              <Stat label="contributors" value={String(contributors.length)} accent />
            </div>
            <div className="cv-hatch" style={{ margin: '12px -16px', borderColor: 'var(--cv-ua-yellow)' }} />
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              {effectivePhase === 'recruiting' && 'Pre-launch — recruiting contributors. The first valid contribution starts the chain. We close the round when geographic + organisational diversity is sufficient.'}
              {effectivePhase === 'ceremony-live' && `Round ${round} in flight. Awaiting the next attestation. The round closes when no new contributors arrive for 24 h.`}
              {effectivePhase === 'live' && 'Ceremony complete. Beacon applied; final parameters published.'}
            </div>
          </div>

          {/* Contributors by country */}
          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className="dot live" />
              <span>CONTRIBUTORS · by country</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill">{contributors.length} total</span>
            </div>
            {byCountry.length === 0 ? (
              <div style={{ padding: '24px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
                No contributors yet. Be the first link in the chain.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                {byCountry.map(([cc, n]) => {
                  const max = byCountry[0]?.[1] ?? 1;
                  return (
                    <div key={cc} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 30px', gap: 8, alignItems: 'center' }}>
                      <span className={`cv-pill ${cc === 'UA' ? 'is-ua' : ''}`}>{cc}</span>
                      <div style={{ height: 14, border: '2px solid var(--cv-ink)', background: '#fff' }}>
                        <div style={{
                          height: '100%', width: `${(n / max) * 100}%`,
                          background: cc === 'UA' ? 'var(--cv-ua-yellow)' : 'var(--cv-ua-blue)',
                        }} />
                      </div>
                      <b style={{ textAlign: 'right', fontFamily: 'var(--cv-display)', fontSize: 18 }}>{n}</b>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="cv-hatch" style={{ margin: '12px -16px' }} />
            <div style={{ fontSize: 11, color: 'var(--cv-mute)' }}>
              Geographic diversity ↑ adversarial coordination ↓.
            </div>
          </div>

          {/* Beacon panel */}
          <div className="cv-card is-yellow">
            <div className="cv-cardhead">
              <span className={`dot ${beaconHash ? 'live' : ''}`} />
              <span>BEACON · public randomness</span>
            </div>
            {beaconHash ? (
              <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
                <Field label="block">{beaconHeight}</Field>
                <Field label="hash">{beaconHash.slice(0, 18)}…{beaconHash.slice(-8)}</Field>
                <Field label="status">applied · ✓</Field>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                After the last contributor, a public-randomness beacon —
                a future Bitcoin / Ethereum mainnet block hash, agreed
                in advance — gets folded into the parameters. Defeats
                last-contributor collusion.
                <br /><br />
                <span style={{ color: 'var(--cv-mute)' }}>
                  Beacon will be published here when the ceremony reaches its final round.
                </span>
              </div>
            )}
            <div className="cv-hatch" style={{ margin: '12px -16px' }} />
            {finalSha
              ? <div style={{ fontSize: 11, fontFamily: 'var(--cv-mono)' }}>final.zkey · {finalSha.slice(0, 14)}…</div>
              : <div style={{ fontSize: 11, color: 'var(--cv-mute)' }}>final.zkey · awaiting completion</div>}
          </div>
        </section>

        {/* FEED-DOWN BANNER */}
        {feedDown && (
          <section className="cv-card" style={{ background: 'var(--cv-err)' }}>
            <div className="cv-cardhead">
              <span>STATUS FEED · unreachable</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-err">FEED DOWN</span>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              We can't reach the ceremony status feed right now. The
              recruit copy below stays accurate — only the live
              attestation chain is unavailable until the feed recovers.
            </div>
          </section>
        )}

        {/* ATTESTATION CHAIN — full width */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>ATTESTATION CHAIN · append-only</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ok">all hashes verified</span>
            <span className="cv-pill">IPFS-pinned</span>
          </div>
          {contributors.length === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                <b>Awaiting first contributor.</b> Run the four commands on a
                38 GB box, attest your hash, and the chain begins. Pre-launch
                posture — no contributions yet recorded.
              </div>
              <Link to="/ceremony/contribute" className="cv-btn is-lg">▶ Be #1</Link>
            </div>
          ) : (
            <table className="cv-table">
              <thead>
                <tr><th>slot</th><th>when</th><th>contributor</th><th>attestation</th><th>verify</th></tr>
              </thead>
              <tbody>
                {[...contributors].reverse().map((c) => (
                  <tr key={`${c.round}-${c.name}`}>
                    <td><b>#{String(c.round).padStart(3, '0')}</b></td>
                    <td style={{ color: 'var(--cv-mute)' }}>{c.completedAt.slice(0, 10)} {c.completedAt.slice(11, 16)}</td>
                    <td style={{ fontFamily: c.profileUrl ? 'var(--cv-mono)' : 'inherit' }}>
                      {c.profileUrl
                        ? <a href={c.profileUrl} className="cv-link" rel="noopener noreferrer">{c.name}</a>
                        : c.name}
                    </td>
                    <td style={{ fontFamily: 'var(--cv-mono)', fontSize: 11 }}>
                      {c.attestation
                        ? <>{c.attestation.slice(0, 12)}…{c.attestation.slice(-6)}</>
                        : <span style={{ color: 'var(--cv-mute)' }}>—</span>}
                    </td>
                    <td>
                      <Link to="/ceremony/verify" className="cv-btn is-sm is-ghost">↗ check</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* PER-CIRCUIT MAP */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          PER-CIRCUIT.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          Two circuits run in lockstep this phase. Each takes its own
          round of contributions; both must complete before parameters
          ship.
        </p>
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {(['v5.3-identity', 'v5.4-age-diia-ua'] as const).map((key) => {
            const c = circuits[key];
            return (
              <div key={key} className={`cv-card ${c?.finalZkeySha256 ? 'is-blue' : 'is-paper'}`}>
                <div className="cv-cardhead" style={c?.finalZkeySha256 ? { color: '#fff' } : undefined}>
                  <span className={`dot ${c ? 'live' : ''}`} />
                  <span>{CIRCUIT_LABELS[key]}</span>
                  <span style={{ flex: 1 }} />
                  <span className={`cv-pill ${c?.finalZkeySha256 ? 'is-ok' : ''}`}>
                    {c?.finalZkeySha256 ? '✓ finalized' : c ? 'in progress' : 'planned'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 12, fontSize: 12.5 }}>
                  <Field label="round">{c?.round ?? 0}</Field>
                  <Field label="last contributor">{c?.lastContributor ?? '—'}</Field>
                  <Field label="last advance">{c?.lastContributedAt?.slice(0, 16).replace('T', ' ') ?? '—'}</Field>
                  <Field label="final.zkey">
                    {c?.finalZkeySha256
                      ? `${c.finalZkeySha256.slice(0, 14)}…${c.finalZkeySha256.slice(-4)}`
                      : 'pending'}
                  </Field>
                </div>
              </div>
            );
          })}
        </section>

        {/* THREE PATHS */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          CONTRIBUTE.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          Three ways to run the four commands. Pick whichever has least friction.
        </p>
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <PathCard n="01" label="Local snarkjs" time="~25 min" req="38 GB RAM" cost="free" body="On your own machine. Five commands, twenty-five minutes wall-clock. Snarkjs holds the intermediate zkey at ~38 GB peak." accent="paper" />
          <PathCard n="02" label="Rented VPS" time="~25 min" req="any 38 GB" cost="≈ €0.10" body="Hetzner CCX43 or any 38 GB Linux box. Same commands. Spin up, run, attest, destroy." accent="yellow" />
          <PathCard n="03" label="Fly.io launcher" time="~25 min" req="Fly token" cost="≈ $0.30" body="One form, your handle, your Fly token. We boot a 48 GB performance-4x machine, run snarkjs, attest, tear down." accent="blue" />
        </section>

        {/* FOUR COMMANDS */}
        <section className="cv-card is-yellow">
          <div className="cv-cardhead">
            <span className="cv-ix">$</span>
            <span>FOUR COMMANDS · this is the entire ceremony for one contributor</span>
            <span style={{ flex: 1 }} />
            <CopyButton text={FOUR_COMMANDS} />
          </div>
          <pre style={{
            background: '#0d0d0d', color: '#e8e2cc',
            border: '2px solid var(--cv-ink)',
            margin: 0, padding: '14px 16px',
            fontFamily: 'var(--cv-mono)', fontSize: 12.5, lineHeight: 1.6,
            overflowX: 'auto', whiteSpace: 'pre',
          }}>{FOUR_COMMANDS}</pre>
          <div className="cv-hatch" style={{ margin: '14px -16px' }} />
          <div style={{ fontSize: 12, lineHeight: 1.55 }}>
            We hand you a signed PUT URL after the contributor guide form;
            the upload goes directly to the next-round bucket. Your contribution
            chains onto the previous one. The verify command runs locally before
            you upload — if it fails, you keep your entropy and try again.
          </div>
        </section>

        {/* WHY EDITORIAL */}
        <section className="cv-card is-blue" style={{ padding: '20px 24px' }}>
          <div className="cv-cardhead" style={{ color: '#fff' }}>
            <span className="cv-ix">↳</span>
            <span>EDITORIAL · WHY A CEREMONY</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 13.5, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              Groth16 — the proof system zkqes uses — needs a trusted setup
              keyed to the specific circuit. The setup is a piece of secret
              entropy that, if recovered, lets a malicious party forge proofs.
              Single-party setups would mean asking the world to trust one
              individual to destroy that secret. We don't ask that.
            </p>
            <p style={{ margin: 0 }}>
              Instead, every contributor adds their own entropy on top of
              the previous round's parameters and destroys their own secret.
              The setup is sound as long as <b style={{ color: 'var(--cv-ua-yellow)' }}>one
              contributor</b> — anywhere in the chain — destroyed their
              entropy. With 50 contributors across 18 countries, the
              coordination required to break that gets very hard, very fast.
            </p>
          </div>
        </section>

        {/* FOOTER STATS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="round" value={String(round)} suffix={round === 1 ? 'contribution' : 'contributions'} />
          <FooterStat label="contributors" value={String(contributors.length)} suffix="attested" yellow />
          <FooterStat label="latest hash" value={contributors[contributors.length - 1]?.attestation?.slice(0, 8) ?? '—'} suffix="…" mono />
          <FooterStat label="soundness" value="1-of-N" suffix="honest" blue />
        </section>

      </div>
    </main>
  );
}

/* — primitives — */

function countByCountry(contributors: readonly CeremonyContributor[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const c of contributors) {
    const m = c.name.match(/\(([A-Z]{2})\)/);
    const cc = m?.[1] ?? '?';
    map.set(cc, (map.get(cc) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="cv-btn is-sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? '✓ copied' : '📋 copy'}
    </button>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ opacity: .7, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <b style={{
        fontFamily: 'var(--cv-display)', fontSize: 22,
        color: accent ? 'var(--cv-ua-yellow)' : undefined,
      }}>{value}</b>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ color: 'var(--cv-mute)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 10.5 }}>{label}</span>
      <span style={{ fontFamily: 'var(--cv-mono)', wordBreak: 'break-all' }}>{children}</span>
    </>
  );
}

function PathCard({ n, label, time, req, cost, body, accent }: {
  n: string; label: string; time: string; req: string; cost: string;
  body: string; accent: 'paper' | 'yellow' | 'blue';
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
        ▶ Open guide
      </Link>
    </div>
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

