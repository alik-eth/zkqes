// /about — Curve-2021 brutalist manifesto + dossier.
// Maximalist version: hero, trust property, how-it-works, timeline,
// why-UA, contributors, umbrella, license, FAQ, contact.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { TopBar } from '../components/curve/TopBar';
import { useCeremonyPhase } from '../hooks/useCeremonyPhase';
import { QTSP_INDEX } from '../generated/qtsp-index';
import { QTSP_SUMMARY_META } from '../generated/qtsp-summary';
import '../styles/curve.css';

const TIMELINE = [
  ['Q4 2025', 'Spec', 'V1 protocol spec frozen', 'done'],
  ['Q1 2026', 'V1 build', 'V5.3 circuit ~3.9M constraints, end-to-end', 'done'],
  ['Q2 2026', 'Phase 2 ceremony', 'Multi-contributor trusted setup · recruiting', 'active'],
  ['Q3 2026', 'Audit', 'External Groth16 + circuit audit', 'planned'],
  ['Q3 2026', 'Mainnet', 'Base mainnet deploy · post-audit', 'planned'],
  ['Q4 2026', 'Multi-network', 'Optimism · zkSync · Solana verifiers', 'planned'],
] as const;

const FAQ = [
  ['Does the chain see my QES?',
    'No. The qualified electronic signature never leaves your device. Only a Groth16 proof + a context-bound nullifier reach the chain.'],
  ['Can I switch wallets later?',
    'Yes. Bind a new wallet under the same nullifier — onchain, the two look unrelated. Rotate / revoke / multi-bind are first-class.'],
  ['What if I lose my QES?',
    'Re-issue with your QTSP. The nullifier is bound to your QES public key — a new key gives a new nullifier. The old binding remains historical.'],
  ['Why a ceremony?',
    'Groth16 needs a trusted setup. As long as ONE contributor honestly destroyed their entropy, soundness holds. We are recruiting now — every additional contributor strengthens the guarantee.'],
  ['Why Ukraine first?',
    'Diia is one of very few mature, public-issuer QES infrastructures with broad citizen adoption. EU expansion follows the same pattern; nothing about V1 is UA-locked.'],
  ['Is this anonymous?',
    'No — and that is the point. zkqes surfaces the exact trust property of every state-issued credential: every-day pseudonymity for the holder; recoverable accountability for the state under lawful process.'],
  ['Is the proof browser or mobile?',
    'Desktop only. The browser path needs Firefox + 38 GB RAM (Chrome / Safari hit the 4 GB WASM heap cap). The @zkqes/cli fast-path needs ~14 s + 3.7 GiB peak — works on any modern laptop. No mobile path.'],
  ['Why Base?',
    'EIP-7212 P-256 precompile lets us verify the QES signature on-chain instead of in-circuit. Verify gas drops to ~230k. Multi-network deploys planned post-audit.'],
];

export function AboutScreen() {
  const { status: ceremonyStatus } = useCeremonyPhase();
  const ceremonyContributors = ceremonyStatus?.contributors ?? [];
  const realQtspCount = QTSP_INDEX.length;
  const liveContribCount = ceremonyContributors.length;
  const liveCountriesCount = new Set(
    ceremonyContributors.map((c) => c.name.match(/\(([A-Z]{2})\)/)?.[1] ?? '?'),
  ).size;
  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar active="about" />
      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">∞</span>
            <span>ABOUT · ZKQES · A ZERO-KNOWLEDGE PROOF OF A QUALIFIED ELECTRONIC SIGNATURE</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">UA · Diia.Sign</span>
            <span className="cv-pill is-eu">EU · {realQtspCount} live</span>
          </div>
          <h1 className="cv-hero" style={{ fontSize: 132 }}>
            WHAT<br />
            <span className="b">IS</span> <span className="y">ZKQES.</span>
          </h1>
          <p style={{ maxWidth: 740, fontSize: 15, marginTop: 18, lineHeight: 1.55 }}>
            zkqes surfaces a property of every state-issued credential — that the
            issuing authority retains the ability to identify a holder under lawful
            process — onto the chain. Everyday pseudonymity for the holder.
            Recoverable accountability for the state. The same trust structure
            as the qualified electronic signature itself.
          </p>
        </section>

        {/* TRUST PROPERTY · binary */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="cv-card is-yellow">
            <div className="cv-cardhead">
              <span className="cv-ix">←</span>
              <span>FOR THE HOLDER · pseudonymity</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, lineHeight: 1.5 }}>
              <Bullet>One identity, unlimited wallets, zero on-chain correlation.</Bullet>
              <Bullet>Your name, country, QTSP — none of it leaves your device.</Bullet>
              <Bullet>Switch wallets, rotate keys, lose hardware — your binding stays.</Bullet>
              <Bullet>No analytics, no cookies, no telemetry. Static dist over IPFS works.</Bullet>
            </ul>
            <div className="cv-hatch" style={{ margin: '14px -16px' }} />
            <div style={{ fontSize: 11, color: 'var(--cv-mute)', letterSpacing: '.06em' }}>
              You sign with your QES. Only a Groth16 proof + a nullifier reach the chain.
            </div>
          </div>

          <div className="cv-card is-blue">
            <div className="cv-cardhead" style={{ color: '#fff' }}>
              <span style={{ flex: 1 }} />
              <span>FOR THE STATE · accountability</span>
              <span className="cv-ix">→</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, lineHeight: 1.5 }}>
              <Bullet>Under lawful process the QTSP can map a binding back to a person.</Bullet>
              <Bullet>The trust structure is identical to the QES itself — no new escrow.</Bullet>
              <Bullet>Revocation flows through the QTSP. Onchain bindings degrade gracefully.</Bullet>
              <Bullet>Audit-ready: every step is byte-exact reproducible from the public keys.</Bullet>
            </ul>
            <div className="cv-hatch" style={{ margin: '14px -16px', borderColor: 'var(--cv-ua-yellow)' }} />
            <div style={{ fontSize: 11, opacity: .85, letterSpacing: '.06em' }}>
              "Identity, escrowed." — not anonymous. Civic-grade pseudonymity.
            </div>
          </div>
        </section>

        {/* HOW IT WORKS · 4 stages + circuit svg */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          HOW IT WORKS.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          Four stages. Every byte deterministic. Every check verifiable from the public LOTL.
        </p>

        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <StageCard n="01" label="Sign locally" body="You sign a canonical binding statement (RFC 8785 JCS) with your QES tool — Diia.Sign, DigiDoc4, Szafir. Output: a detached CAdES-X .p7s." />
          <StageCard n="02" label="Parse + verify" body="The browser parses the .p7s, walks the cert chain, validates the QTSP signature, and checks the issuer against the per-country trust-list Merkle root. All client-side." accent="yellow" />
          <StageCard n="03" label="Prove" body="A Groth16 prover (Firefox snarkjs or @zkqes/cli rapidsnark) emits a 20 KB proof over a ~3.9M-constraint circuit. The proof says: I hold a valid QES from a listed QTSP. Nothing else." accent="blue" />
          <StageCard n="04" label="Anchor" body="Proof + nullifier go on-chain via your wallet. ~230k gas. Your wallet is now bound to a qualified identity — without disclosing it." />
        </section>

        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>CIRCUIT · zkqes_v5.4 · the proving graph</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ok">audit · pending Q3</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11, marginBottom: 10 }}>
            <CircuitStat label="constraints" value="~3.9M" />
            <CircuitStat label="public in" value="22" />
            <CircuitStat label="signature" value="ECDSA P-256" />
            <CircuitStat label="curve" value="BN254" />
          </div>
          <svg viewBox="0 0 760 180" width="100%" style={{ border: '2px solid var(--cv-ink)', background: '#fff' }}>
            {([
              [60, 50, 'CMS\n.p7s'], [60, 130, 'cert\nchain'],
              [240, 90, 'parse\n+ verify\nCAdES'],
              [420, 50, 'merkle\nTSL'], [420, 130, 'hash\nQ-pk'],
              [600, 50, 'nullifier\nctx-bound'], [600, 130, 'binding\nstatement'],
              [720, 90, 'proof'],
            ] as const).map((n, i) => (
              <g key={i}>
                <rect x={n[0] - 50} y={n[1] - 22} width="100" height="44" fill="var(--cv-ua-yellow)" stroke="var(--cv-ink)" strokeWidth="2" />
                {n[2].split('\n').map((t, j) => (
                  <text key={j} x={n[0]} y={n[1] - 6 + j * 12} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--cv-ink)">{t}</text>
                ))}
              </g>
            ))}
            {([
              [110, 50, 190, 80], [110, 130, 190, 100],
              [290, 80, 370, 50], [290, 100, 370, 130],
              [470, 50, 550, 50], [470, 130, 550, 130],
              [650, 50, 700, 80], [650, 130, 700, 100],
            ] as const).map((e, i) => (
              <line key={i} x1={e[0]} y1={e[1]} x2={e[2]} y2={e[3]} stroke="var(--cv-ua-blue)" strokeWidth="2" />
            ))}
          </svg>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <a href="https://github.com/alik-eth/zkqes/tree/main/packages/circuits" rel="noopener noreferrer" className="cv-btn is-sm">↗ view circom</a>
            <Link to="/ceremony" className="cv-btn is-sm is-ghost">↗ ceremony status</Link>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ok">groth16 · BN254 · pot22</span>
          </div>
        </section>

        {/* TIMELINE · horizontal */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          TIMELINE.
        </h2>
        <section className="cv-card">
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: `repeat(${TIMELINE.length}, 1fr)`, gap: 0, position: 'relative' }}>
            {TIMELINE.map(([when, label, body, st], i) => {
              const bg = st === 'active' ? 'var(--cv-ua-yellow)' : st === 'done' ? 'var(--cv-ok)' : '#fff';
              return (
                <div key={i} style={{
                  borderRight: i < TIMELINE.length - 1 ? '2px dashed var(--cv-ink)' : 'none',
                  padding: '12px 14px', background: bg,
                }}>
                  <div style={{ fontFamily: 'var(--cv-display)', fontSize: 22, color: 'var(--cv-ua-blue)' }}>{when}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--cv-mute)', marginTop: 6, lineHeight: 1.45 }}>{body}</div>
                  <span className={`cv-pill ${st === 'active' ? 'is-blue' : st === 'done' ? 'is-ok' : ''}`} style={{ marginTop: 8, display: 'inline-block' }}>
                    {st}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* WHY UA, WHY EIDAS · editorial card */}
        <section className="cv-card is-blue" style={{ padding: '20px 24px' }}>
          <div className="cv-cardhead" style={{ color: '#fff' }}>
            <span className="cv-ix">↳</span>
            <span>EDITORIAL · WHY EIDAS, WHY UA FIRST</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 13.5, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              EU eIDAS (Reg. 910/2014) is the largest deployment of qualified electronic
              signatures in the world. 27 member states, {QTSP_SUMMARY_META.totalTsps} listed QTSPs, ~50M citizens
              with active QES credentials. Every signature carries a state-grade trust
              property — and every issuer is bound by the same legal framework.
              Building a ZK protocol over QES means every onboarded country adds 1M+
              users without a single new trust assumption.
            </p>
            <p style={{ margin: 0 }}>
              Ukraine ships first because Diia is one of very few public-issuer QES
              infrastructures with mature broad-population coverage — 19M+ active QES
              holders. UA 2155-VIII (the Ukrainian eIDAS counterpart) interoperates
              cleanly with the EU framework. The UA-first launch is a forcing function:
              prove the protocol works against a real, full-spectrum QTSP, then unlock
              the rest of Europe by adding TSL roots.
            </p>
          </div>
          <div className="cv-hatch" style={{ margin: '16px -24px', borderColor: 'var(--cv-ua-yellow)' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--cv-ua-yellow)', letterSpacing: '.1em', textTransform: 'uppercase' }}>roadmap order</span>
            {['UA', 'PL', 'DE', 'FR', 'IT', 'ES', 'NL', '+ 20'].map(c => (
              <span key={c} className={`cv-pill ${c === 'UA' ? 'is-ua' : ''}`}>{c}</span>
            ))}
          </div>
        </section>

        {/* CONTRIBUTORS · who builds */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="cv-card is-paper">
            <div className="cv-cardhead">
              <span className={`dot ${liveContribCount > 0 ? 'live' : ''}`} />
              <span>WHO BUILDS THIS · contributors</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, fontSize: 12 }}>
              {[
                ['founder · protocol · circuits', '@alik-eth', 'UA'],
                ['cryptography · review', 'pending audit', '—'],
                [
                  'ceremony contributors',
                  liveContribCount === 0
                    ? 'recruiting — be the first'
                    : `${liveContribCount} across ${liveCountriesCount} countr${liveCountriesCount === 1 ? 'y' : 'ies'}`,
                  liveContribCount === 0 ? '0' : String(liveContribCount),
                ],
                ['translators', 'EN · UK', '2'],
                [
                  'QTSP integrators',
                  QTSP_INDEX.map((q) => q.displayName).join(' · '),
                  String(realQtspCount),
                ],
              ].map((r, i) => {
                const [label, value, tag] = r;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 70px', gap: 8, padding: '6px 0', borderBottom: '1px dashed rgba(0,0,0,.2)', alignItems: 'center' }}>
                    <span style={{ color: 'var(--cv-mute)', letterSpacing: '.04em' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--cv-mono)' }}>{value}</span>
                    <span className="cv-pill" style={{ justifySelf: 'end' }}>{tag}</span>
                  </div>
                );
              })}
            </div>
            <div className="cv-hatch" style={{ margin: '14px -16px' }} />
            <Link to="/ceremony" className="cv-btn is-sm">↗ See every contributor</Link>
          </div>

          <div className="cv-card is-yellow">
            <div className="cv-cardhead">
              <span>UMBRELLA · THE BIGGER PROJECT</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-blue">phase 2 · live</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              <b>zkqes</b> is V1 of a broader project: <b>Identity Escrow</b> — a
              transferable certificate of qualified identity, mintable only by holders
              of a state-issued QES. Identity-Escrow adds escrow commitments,
              arbitrator UI, revoke flows; the V1 protocol here is the foundation.
            </div>
            <div className="cv-hatch" style={{ margin: '14px -16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--cv-mute)' }}>V1 (now)</span><span>QKB — qualified key binding · Base Sepolia · ceremony recruiting</span>
              <span style={{ color: 'var(--cv-mute)' }}>V2 (Q4)</span><span>QIE — escrow + arbitrator + recovery</span>
              <span style={{ color: 'var(--cv-mute)' }}>V3 (2027)</span><span>Identity-Escrow ERC-721 · pan-EU TLs · multi-chain</span>
            </div>
          </div>
        </section>

        {/* LICENSE · open-source */}
        <section className="cv-card">
          <div className="cv-cardhead">
            <span className="cv-ix">$</span>
            <span>OPEN SOURCE · MIT · zero proprietary deps in the trust path</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ok">audit · open</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, fontSize: 12 }}>
            <LicenseCol head="repo" lines={[
              ['github.com/alik-eth/zkqes', 'https://github.com/alik-eth/zkqes'],
              ['issues', 'https://github.com/alik-eth/zkqes/issues'],
              ['releases', 'https://github.com/alik-eth/zkqes/releases'],
            ]} />
            <LicenseCol head="spec" lines={[
              ['v1 protocol design', 'https://github.com/alik-eth/zkqes/tree/main/docs/superpowers/specs'],
              ['circuit invariants', 'https://github.com/alik-eth/zkqes/tree/main/packages/circuits'],
              ['ceremony attestations', '/ceremony'],
            ]} />
            <LicenseCol head="audit" lines={[
              ['pre-print · Q3 2026', '#'],
              ['public bug bounty · TBA', '#'],
              ['responsible disclosure', '#vulnerabilities'],
            ]} />
            <LicenseCol head="legal" lines={[
              ['MIT license', 'https://github.com/alik-eth/zkqes/blob/main/LICENSE'],
              ['no telemetry', '#privacy'],
              ['no PII on chain', '#privacy'],
            ]} />
          </div>
        </section>

        {/* FAQ · accordion */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          FAQ.
        </h2>
        <section className="cv-card is-paper">
          {FAQ.map((q, i) => <FaqItem key={i} q={q[0]!} a={q[1]!} initiallyOpen={i === 0} />)}
        </section>

        {/* CONTACT + DISCLOSURE */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="cv-card is-blue">
            <div className="cv-cardhead" style={{ color: '#fff' }}>
              <span>CONTACT · we read everything</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, fontSize: 13 }}>
              {[
                ['email', 'hello@zkqes.org', 'mailto:hello@zkqes.org'],
                ['github', 'alik-eth/zkqes · issues + discussions', 'https://github.com/alik-eth/zkqes'],
                ['x / twitter', '@alik_eth', 'https://x.com/alik_eth'],
                ['telegram', '@zkqes (community)', 'https://t.me/zkqes'],
              ].map(([label, val, href]) => (
                <a key={label as string} href={href as string} rel="noopener noreferrer" style={{
                  display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '6px 0',
                  borderBottom: '1px dashed rgba(255,215,0,.4)', color: '#fff', textDecoration: 'none',
                }}>
                  <span style={{ color: 'var(--cv-ua-yellow)', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 11 }}>{label}</span>
                  <span>{val} <span style={{ color: 'var(--cv-ua-yellow)' }}>↗</span></span>
                </a>
              ))}
            </div>
          </div>

          <div className="cv-card is-yellow" id="vulnerabilities">
            <div className="cv-cardhead">
              <span>RESPONSIBLE DISCLOSURE</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-err">SECURITY</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>
              Found a vulnerability? Email <a href="mailto:security@zkqes.org" className="cv-link">security@zkqes.org</a> with PGP-encrypted details — fingerprint <code style={{ background: '#fff', padding: '1px 6px', border: '1.5px solid var(--cv-ink)', fontSize: 11.5 }}>D7C2 9F81 2204 AB02 00EE</code>.
              <br /><br />
              We commit to: 24h acknowledgement · 7-day initial response · 90-day fix
              window before public disclosure · credit on the security page · bounty
              once mainnet ships. Do not file public issues for security bugs.
            </div>
          </div>
        </section>

        {/* CLOSER */}
        <section className="cv-card is-stripe" style={{ padding: '20px 26px', textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'var(--cv-display)', fontSize: 64, lineHeight: 1, margin: 0 }}>
            <span>PROVE.</span> <span style={{ color: 'var(--cv-ua-blue)' }}>DON'T</span> <span style={{ color: 'var(--cv-ua-yellow)', WebkitTextStroke: '2px var(--cv-ink)' as never }}>REVEAL.</span>
          </h3>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
            <span className="cv-cta-wrap" data-desktop-only>
              <a href="https://app.zkqes.org" className="cv-btn is-lg">▶ Open the app</a>
            </span>
            <Link to="/ceremony/contribute" className="cv-btn is-blue is-lg">↳ Contribute to the ceremony</Link>
          </div>
        </section>

      </div>
    </main>
  );
}

/* — local primitives — */

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, alignItems: 'baseline' }}>
      <span style={{ fontFamily: 'var(--cv-display)', fontSize: 18, color: 'var(--cv-ua-blue)' }}>▸</span>
      <span>{children}</span>
    </li>
  );
}

function StageCard({ n, label, body, accent }: { n: string; label: string; body: string; accent?: 'yellow' | 'blue' }) {
  const cls = accent === 'yellow' ? 'is-yellow' : accent === 'blue' ? 'is-blue' : 'is-paper';
  const isBlue = accent === 'blue';
  return (
    <div className={`cv-card ${cls}`}>
      <div className="cv-cardhead" style={isBlue ? { color: '#fff' } : undefined}>
        <span className="cv-ix">{n}</span>
        <span>{label}</span>
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>{body}</p>
    </div>
  );
}

function CircuitStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '2px solid var(--cv-ink)', padding: 6, background: '#fff', textAlign: 'center' }}>
      <div style={{ color: 'var(--cv-mute)', fontSize: 9.5, letterSpacing: '.1em' }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: 'var(--cv-display)', fontSize: 22, color: 'var(--cv-ua-blue)' }}>{value}</div>
    </div>
  );
}

function LicenseCol({ head, lines }: { head: string; lines: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div>
      <div style={{ color: 'var(--cv-mute)', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>{head}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lines.map(([label, href]) => (
          <li key={label}>
            <a href={href} rel="noopener noreferrer" className="cv-link" style={{ fontSize: 12 }}>{label} ↗</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ q, a, initiallyOpen }: { q: string; a: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <div style={{ borderTop: '2px solid var(--cv-ink)' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', textAlign: 'left', background: open ? 'var(--cv-ua-yellow)' : 'transparent',
        border: 0, padding: '10px 12px', fontFamily: 'var(--cv-mono)', fontSize: 14, fontWeight: 500,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontFamily: 'var(--cv-display)', fontSize: 22, color: 'var(--cv-ua-blue)' }}>{open ? '−' : '+'}</span>
        {q}
      </button>
      {open && <div style={{ padding: '4px 12px 14px 44px', fontSize: 13, color: '#3a352c', lineHeight: 1.55 }}>{a}</div>}
    </div>
  );
}

