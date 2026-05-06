// HomeDocument — app.zkqes.org `/` Curve-2021 control room.
//
// Heavy-utilitarian: live-wires wallet (wagmi), prover (CLI presence
// detection), ceremony phase, and existing-bindings lookup. The page
// answers "am I ready to file, and what happens next?" with real
// state, not promises.
//
// App-target only — wagmi + bindings hooks are gated by VITE_TARGET.
// Per CLAUDE.md invariant #21 the WalletProvider is conditional in
// main.tsx; this component assumes it's mounted (i.e. VITE_TARGET=app).

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useAccount, useBalance, useChainId } from 'wagmi';

import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { useCliPresence } from '../../hooks/useCliPresence';
import { useV5_4BindingsForWallet } from '../../hooks/useV5_4BindingsForWallet';
import { TopBar } from '../curve/TopBar';

import '../../styles/curve.css';

const CHAIN_NAMES: Record<number, string> = {
  84532: 'Base Sepolia',
  8453: 'Base',
  1: 'Ethereum',
  11155111: 'Sepolia',
};

export function HomeDocument() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const { phase, status: ceremonyStatus } = useCeremonyPhase();
  const { status: cliStatus, cliStatus: cliPayload } = useCliPresence();
  const { data: bindings, isLoading: bindingsLoading } =
    useV5_4BindingsForWallet(address);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const chainName = chainId ? CHAIN_NAMES[chainId] ?? `chain ${chainId}` : '—';
  const onCorrectChain = chainId === 84532;
  const balanceFmt = balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : '—';
  const addrShort = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  const ceremonyRound = ceremonyStatus?.round ?? 0;

  const proverReady = cliStatus === 'present';
  const proverMode = proverReady ? 'CLI · ~14s' : 'Firefox · ~5min · 38 GB RAM';

  const bindingsCount = bindings?.length ?? 0;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="home"
        statusPill={addrShort
          ? <span className="cv-pill" style={{ background: onCorrectChain ? 'var(--cv-ok)' : 'var(--cv-err)' }}>{addrShort} · {chainName}</span>
          : <span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● not connected</span>}
        extraNav={<>
          <Link to="/ua/registerV5" style={{ padding: '4px 10px', border: '2px solid transparent', color: '#f4f0e0', fontWeight: 500, fontSize: 13, textDecoration: 'none' }}>Register</Link>
          <Link to="/account/rotate" style={{ padding: '4px 10px', border: '2px solid transparent', color: '#f4f0e0', fontWeight: 500, fontSize: 13, textDecoration: 'none' }}>Account</Link>
        </>}
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">▶</span>
            <span>FILE A NEW BINDING · DESKTOP ONLY · FIREFOX + 38 GB OR @zkqes/cli</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">app.zkqes.org</span>
            <span className={`cv-pill ${onCorrectChain ? 'is-ok' : 'is-err'}`}>
              {chainName}
            </span>
            <span className="cv-pill">{now.toLocaleTimeString('en-GB', { hour12: false })}</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 138 }}>
                READY <span className="b">TO</span><br />
                <span className="y">FILE.</span>
              </h1>
              <p style={{ maxWidth: 700, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
                Bind your wallet to a qualified electronic signature.
                Four steps — connect wallet, sign QES, generate Groth16 proof,
                anchor onchain. Proving needs <b>Firefox + 38 GB RAM</b> in-tab,
                or the <code style={{ background: 'var(--cv-ua-yellow)', padding: '1px 5px', border: '1.5px solid var(--cv-ink)' }}>@zkqes/cli</code> running on
                localhost (~14 s, 3.7 GiB peak). No mobile path. Nothing leaves
                this tab except a 20 KB proof and a context-bound nullifier.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <span className="cv-sticker">no telemetry</span>
              <Link to="/ua/registerV5" className="cv-btn is-lg" style={{ minWidth: 240, justifyContent: 'center' }}>
                ▶ Begin filing
              </Link>
              <Link to="/verify" className="cv-btn is-blue is-lg" style={{ minWidth: 240, justifyContent: 'center' }}>
                ↗ Verify a binding
              </Link>
              <span style={{ fontSize: 10.5, color: 'var(--cv-mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                {isConnected ? 'wallet connected · proceed' : 'connects wallet at step 01'}
              </span>
            </div>
          </div>
        </section>

        {/* READINESS — 3 cards */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {/* WALLET */}
          <div className={`cv-card ${isConnected ? 'is-paper' : 'is-yellow'}`}>
            <div className="cv-cardhead">
              <span className={`dot ${isConnected ? 'live' : ''}`} />
              <span>WALLET</span>
              <span style={{ flex: 1 }} />
              <span className={`cv-pill ${isConnected ? 'is-ok' : 'is-warn'}`}>
                {isConnected ? '✓ connected' : 'not connected'}
              </span>
            </div>
            {isConnected ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12, fontSize: 13 }}>
                <ReadoutRow label="address" value={addrShort ?? '—'} mono />
                <ReadoutRow label="chain" value={chainName} {...(!onCorrectChain ? { accent: 'err' as const } : {})} />
                <ReadoutRow label="balance" value={balanceFmt} />
                <ReadoutRow label="bindings" value={bindingsLoading ? '…' : `${bindingsCount} active`} />
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  Step 01 of the filing flow connects an EIP-1193 wallet
                  (MetaMask · WalletConnect · Coinbase). The wallet only
                  signs the final anchor transaction; the QES does the
                  actual identity proof.
                </p>
                <div className="cv-hatch" style={{ margin: '12px -16px' }} />
                <Link to="/ua/registerV5" className="cv-btn is-blue">▶ Connect at step 01</Link>
              </>
            )}
          </div>

          {/* PROVER */}
          <div className={`cv-card ${proverReady ? 'is-blue' : 'is-paper'}`}>
            <div className="cv-cardhead" style={proverReady ? { color: '#fff' } : undefined}>
              <span className={`dot ${proverReady ? 'live' : ''}`} />
              <span>PROVER</span>
              <span style={{ flex: 1 }} />
              <span className={`cv-pill ${proverReady ? 'is-ok' : ''}`}>
                {cliStatus === 'detecting' ? 'detecting…' : proverReady ? '✓ CLI' : 'browser'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12, fontSize: 13 }}>
              <ReadoutRow label="mode" value={proverMode} />
              <ReadoutRow label="circuit" value={cliPayload?.circuit ?? 'zkqes_v5'} mono />
              <ReadoutRow label="zkey" value={proverReady ? 'loaded · 4.2 GB' : 'fetched on demand'} />
              <ReadoutRow label="constraints" value="2.1M" />
            </div>
            {!proverReady && (
              <>
                <div className="cv-hatch" style={{ margin: '12px -16px' }} />
                <div style={{ fontSize: 11, color: 'var(--cv-mute)', lineHeight: 1.5 }}>
                  Firefox-only browser path: Groth16 in-tab, 38 GB RAM peak,
                  ~5 min. Chrome/Safari hit the 4 GB WASM heap cap and abort.
                  Install <code>@zkqes/cli</code> for a 14 s prove via rapidsnark.
                </div>
                <Link to="/ua/cli" className="cv-btn is-sm" style={{ marginTop: 8 }}>
                  $ npm i -g @zkqes/cli
                </Link>
              </>
            )}
          </div>

          {/* CEREMONY */}
          <div className={`cv-card ${phase === 'live' ? 'is-paper' : 'is-yellow'}`}>
            <div className="cv-cardhead">
              <span className="dot live" />
              <span>CEREMONY</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-blue">{phase ?? 'recruiting'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <div className="cv-num sm" style={{ color: 'var(--cv-ua-blue)' }}>
                {ceremonyRound}
              </div>
              <div style={{ fontSize: 13, color: 'var(--cv-mute)' }}>
                contribution{ceremonyRound === 1 ? '' : 's'} so far
              </div>
            </div>
            <div className="cv-hatch" style={{ margin: '12px -16px' }} />
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
              {phase === 'live'
                ? 'Setup complete. Every proof is sound under the 1-of-N honest-contributor assumption.'
                : phase === 'ceremony-live'
                  ? 'Ceremony in progress. Filings are gated until the final round closes.'
                  : 'Ceremony recruiting contributors. Pre-launch — filings will mint at first ceremony close.'}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <Link to="/ceremony" className="cv-btn is-sm is-ghost">↗ status</Link>
              <Link to="/ceremony/contribute" className="cv-btn is-sm">+ contribute</Link>
            </div>
          </div>
        </section>

        {/* ACTIONS — every function as a card */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          ACTIONS.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          Every operation that touches the registry. Each card opens its own flow — runs in this tab.
        </p>

        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <ActionCard
            n="01"
            title="Register a binding"
            subtitle="bind a wallet to your QES"
            body="Sign a JCS binding statement with your QES, generate a Groth16 proof in this tab, anchor it on-chain. ~5 min."
            steps={['connect wallet', 'sign QES', 'prove', 'anchor']}
            cta="▶ Begin"
            to="/ua/registerV5"
            accent="yellow"
            primary
            available
          />
          <ActionCard
            n="02"
            title="Rotate a wallet"
            subtitle="move a binding to a new wallet"
            body="Two-wallet flow: connect old, sign rotation auth, connect new, sign with QES, anchor. The binding's nullifier is preserved; the on-chain pk changes."
            steps={['connect old', 'auth', 'connect new', 'prove', 'anchor']}
            cta="⟲ Rotate"
            to="/account/rotate"
            accent="paper"
            available={bindingsCount > 0}
            disabledNote={!isConnected ? 'connect a wallet first' : 'no bindings to rotate'}
          />
          <ActionCard
            n="03"
            title="Prove age"
            subtitle="add a DOB attestation to a binding"
            body="Prove your DOB satisfies a custom date threshold (e.g. ≥ 18) without disclosing it. Adds a DOB commit to an existing binding."
            steps={['pick binding', 'sign QES with DOB', 'prove cutoff', 'anchor']}
            cta="▷ Prove age"
            to="/account/prove-age"
            accent="paper"
            available={bindingsCount > 0}
            disabledNote={!isConnected ? 'connect a wallet first' : 'no bindings to attest'}
          />
        </section>

        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <ActionCard
            n="04"
            title="Verify a binding"
            subtitle="public lookup · no wallet needed"
            body="Paste an address or binding ID; we query the registry directly via viem. Truth from the chain, runs in this tab."
            steps={['paste', 'query', 'render']}
            cta="↗ Open verifier"
            to="/verify"
            accent="paper"
            available
          />
          <ActionCard
            n="05"
            title="Install @zkqes/cli"
            subtitle="rapidsnark fast-path · ~14s prove · 3.7 GiB peak"
            body={proverReady
              ? 'Already detected at localhost:9080. The browser path is now backup; this tab uses your CLI for proving.'
              : 'Browser proving needs Firefox + 38 GB RAM. The CLI proves locally with rapidsnark in ~14 s and 3.7 GiB peak — works on any laptop. Localhost-bound, origin-pinned to app.zkqes.org.'}
            steps={proverReady ? ['✓ detected · localhost:9080'] : ['npm i -g @zkqes/cli', 'zkqes serve', 'browser auto-detects']}
            cta={proverReady ? '✓ CLI ready' : '$ npm i -g @zkqes/cli'}
            to="/ua/cli"
            accent="paper"
            available
          />
          <ActionCard
            n="06"
            title="Mobile? Use desktop"
            subtitle="proving needs Firefox + 38 GB or the CLI"
            body="No mobile path. Browser proving demands Firefox + 38 GB RAM peak; phones, tablets, Chromebooks can't run it. Either come back from a desktop, or run the CLI on a laptop and use this tab as the wallet client."
            steps={['device check', 'route mobile → desktop']}
            cta="↗ Use-desktop info"
            to="/ua/use-desktop"
            accent="paper"
            available
          />
        </section>

        {/* YOUR BINDINGS */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>YOUR BINDINGS · {chainName}</span>
            <span style={{ flex: 1 }} />
            {isConnected
              ? <span className="cv-pill">{bindingsLoading ? 'loading…' : `${bindingsCount} found`}</span>
              : <span className="cv-pill is-warn">connect wallet to see</span>}
          </div>
          {!isConnected ? (
            <div style={{ padding: '18px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
              Connect a wallet at step 01 of the register flow to see existing bindings.
            </div>
          ) : bindingsLoading ? (
            <div style={{ padding: '18px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
              Reading on-chain logs from {chainName}…
            </div>
          ) : bindingsCount === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <b>No bindings yet.</b> This wallet has never been bound to a qualified
                identity on {chainName}. File the first one — it takes about five minutes.
              </div>
              <Link to="/ua/registerV5" className="cv-btn is-lg">▶ File the first one</Link>
            </div>
          ) : (
            <table className="cv-table">
              <thead>
                <tr><th>#</th><th>binding ID</th><th>state</th><th>actions</th></tr>
              </thead>
              <tbody>
                {bindings?.map((id, i) => (
                  <tr key={id}>
                    <td><b>{String(i + 1).padStart(2, '0')}</b></td>
                    <td style={{ fontFamily: 'var(--cv-mono)' }}>{id.slice(0, 14)}…{id.slice(-6)}</td>
                    <td><span className="cv-pill is-ok">active</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <Link to="/account/rotate" className="cv-btn is-sm is-ghost">⟲ rotate</Link>
                      <Link to="/account/prove-age" className="cv-btn is-sm is-ghost">▷ prove-age</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* BINDING STATEMENT PREVIEW */}
        <section className="cv-card is-yellow">
          <div className="cv-cardhead">
            <span className="cv-ix">§</span>
            <span>BINDING STATEMENT · this is what you will sign with your QES</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-blue">RFC 8785 · JCS</span>
          </div>
          <pre style={{
            background: '#fff',
            border: '2px solid var(--cv-ink)',
            margin: 0,
            padding: '14px 16px',
            fontFamily: 'var(--cv-mono)',
            fontSize: 12.5,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>{`{
  "domain": "qkb-binding-v1",
  "wallet": "${address ?? '0x▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓'}",
  "chain":  ${chainId ?? '▓▓▓▓▓'},
  "registry": "0xeE3bE…4816",
  "context": null,
  "issued":  "${now.toISOString().slice(0, 19)}Z"
}`}</pre>
          <div className="cv-hatch" style={{ margin: '14px -16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              By signing with your QES, you bind <b>this exact wallet</b> to your qualified
              identity. The statement is canonical (RFC 8785) so the circuit can byte-match
              it. Nothing else is signed; nothing else is on-chain.
            </div>
            <Link to="/ua/registerV5" className="cv-btn is-blue is-lg">▶ Sign with QES →</Link>
          </div>
        </section>

        {/* FOOTER STATS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="proof size" value="~20" suffix="KB" />
          <FooterStat label="verify gas" value="~230" suffix="k" yellow />
          <FooterStat label="wallet" value={addrShort ?? '—'} suffix={isConnected ? 'connected' : 'idle'} />
          <FooterStat label="network" value={chainName} suffix={onCorrectChain ? '✓' : '⚠'} blue />
        </section>

      </div>
    </main>
  );
}

function ActionCard({
  n, title, subtitle, body, steps, cta, to, accent, primary, available, disabledNote,
}: {
  n: string; title: string; subtitle: string; body: string;
  steps: readonly string[]; cta: string; to: string;
  accent: 'paper' | 'yellow' | 'blue';
  primary?: boolean;
  available: boolean;
  disabledNote?: string;
}) {
  const cls = accent === 'paper' ? 'is-paper' : accent === 'yellow' ? 'is-yellow' : 'is-blue';
  const isBlue = accent === 'blue';
  const btnCls = primary ? 'cv-btn is-blue is-lg' : isBlue ? 'cv-btn' : 'cv-btn';
  return (
    <div className={`cv-card ${cls}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="cv-cardhead" style={isBlue ? { color: '#fff' } : undefined}>
        <span className="cv-ix">{n}</span>
        <span style={{ fontWeight: 700 }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span className={`cv-pill ${available ? 'is-ok' : ''}`}>{available ? '✓ ready' : 'gated'}</span>
      </div>
      <div style={{ fontSize: 11, color: isBlue ? 'var(--cv-ua-yellow)' : 'var(--cv-mute)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        {subtitle}
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0, flex: 1 }}>{body}</p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '12px 0' }}>
        {steps.map((s, i) => (
          <span key={i} className="cv-pill" style={{ fontSize: 9.5 }}>{s}</span>
        ))}
      </div>
      <div className="cv-hatch" style={{ margin: '0 -16px 12px', ...(isBlue ? { borderColor: 'var(--cv-ua-yellow)' } : {}) }} />
      {available
        ? <span className="cv-cta-wrap" data-desktop-only data-variant="sm" style={{ width: '100%' }}>
            <Link to={to} className={btnCls}
                  style={primary
                    ? { width: '100%', justifyContent: 'center' }
                    : isBlue
                      ? { background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)', width: '100%', justifyContent: 'center' }
                      : { width: '100%', justifyContent: 'center' }}>
              {cta}
            </Link>
          </span>
        : <button disabled className="cv-btn" style={{
            width: '100%', justifyContent: 'center',
            background: '#ddd', color: '#888', cursor: 'not-allowed', boxShadow: 'none',
          }}>
            {disabledNote ?? cta}
          </button>}
    </div>
  );
}

function ReadoutRow({ label, value, mono, accent }: {
  label: string; value: string; mono?: boolean; accent?: 'err' | 'ok';
}) {
  return (
    <>
      <span style={{ color: 'var(--cv-mute)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--cv-mono)' : 'var(--cv-mono)',
        fontSize: 13, fontWeight: 500, textAlign: 'right',
        color: accent === 'err' ? '#a00' : accent === 'ok' ? '#2e7d32' : 'var(--cv-ink)',
      }}>{value}</span>
    </>
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
        {value} {suffix && <span style={{ fontSize: 16 }}>{suffix}</span>}
      </div>
    </div>
  );
}
