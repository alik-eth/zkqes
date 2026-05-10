// app.zkqes.org `/` — terminal-style control room.
//
// Terse: status bar, the actual register flow inline, bindings table,
// secondary action row. No hero. No marketing copy. No "what is this".
// Click the action you want; it runs in this tab. Mounts Step1-4 in
// place — there is no /ua/registerV5 detour anymore.

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';

import { Step2GenerateBinding } from '../ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../ua/v5/Step4ProveAndRegister';
import { useCliPresence } from '../../hooks/useCliPresence';
import { useV5_4BindingsForWallet } from '../../hooks/useV5_4BindingsForWallet';
import { TopBar } from '../curve/TopBar';

import '../../styles/curve.css';
// Step1-4 components are styled with the civic-terminal token set
// (--ct-ink / --mono / --display / .ct cascade). Curve and ct share
// the same fonts + colors at the var level, so importing civic-terminal
// alongside curve and wrapping the step container in `.ct` gives the
// inline wizard the styling it expects without rewriting Step*.
import '../../styles/civic-terminal.css';

// Wallet connect lives in the top status bar (RainbowKit), not as a
// numbered step. The wizard is a 4-step flow:
//   01 — generate binding (Step2GenerateBinding under the hood)
//   02 — sign with QES    (Step3DiiaSign under the hood)
//   03 — prove            (Step4ProveAndRegister, phase='prove')
//   04 — review + anchor  (Step4ProveAndRegister, phase='review')
// Step4ProveAndRegister renders BOTH 03 and 04 with internal state
// preserved across the phase transition (provedArgs survives).
// The internal Step{2,3,4} component names are historical and stay
// (CLAUDE.md invariants reference them). UI numbering is 1/2/3/4.
type StepNumber = 1 | 2 | 3 | 4;

interface BrowserInfo {
  readonly name: 'Firefox' | 'Chrome' | 'Safari' | 'Edge' | 'Brave' | 'Other';
  readonly proverCapable: boolean;  // Firefox is the only browser with a working snarkjs prove path at 38 GB RAM.
}

function detectBrowser(): BrowserInfo {
  if (typeof navigator === 'undefined') return { name: 'Other', proverCapable: false };
  const ua = navigator.userAgent;
  const isFirefox = /Firefox\//.test(ua);
  const isEdge = /Edg\//.test(ua);
  const isBrave = (navigator as { brave?: { isBrave?: () => Promise<boolean> } }).brave !== undefined;
  const isChrome = !isEdge && !isBrave && /Chrome\//.test(ua);
  const isSafari = !isChrome && !isEdge && !isBrave && /Safari\//.test(ua) && !/Chrome\//.test(ua);
  const name: BrowserInfo['name'] =
    isFirefox ? 'Firefox' :
    isEdge ? 'Edge' :
    isBrave ? 'Brave' :
    isChrome ? 'Chrome' :
    isSafari ? 'Safari' :
    'Other';
  return { name, proverCapable: isFirefox };
}

export function HomeDocument() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { status: cliStatus } = useCliPresence();
  const { data: bindings, isLoading: bindingsLoading } =
    useV5_4BindingsForWallet(address);

  const [step, setStep] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);
  // Age-proof opt-in lifted here so Step3 sets it and Step4 reads it.
  // Default `true` because V5.4 UA registry hard-sets `dobSupported = 1`.
  const [ageOptIn, setAgeOptIn] = useState(true);
  const [ageCutoffYmd, setAgeCutoffYmd] = useState<number>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return Number(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
    );
  });

  const browser = useMemo(() => detectBrowser(), []);
  const proverReady = cliStatus === 'present';
  const bindingsCount = bindings?.length ?? 0;
  // Browser-prove is feasible only on Firefox + 38 GB RAM. CLI-prove is
  // feasible on any laptop. The "ready to prove" gate is one OR the other.
  const proverFeasible = proverReady || browser.proverCapable;

  const reset = () => {
    setStep(1);
    setBindingBytes(null);
    setP7s(null);
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar active="home" />

      <div style={{ padding: '14px 22px 24px', display: 'grid', gap: 14 }}>

        {/* STATUS BAR — preflight: can this browser actually prove? */}
        <section className="cv-card is-paper cv-statusbar" style={{ padding: '12px 14px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center', gap: 14,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'center' }}>
              <span style={{
                fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase',
                color: 'var(--cv-ua-blue)', fontWeight: 700,
              }}>preflight</span>

              <Stat
                label="browser"
                value={browser.name}
                state={browser.proverCapable ? 'ok' : 'err'}
                hint={browser.proverCapable ? 'Firefox is the only browser that can in-tab prove (snarkjs · 38 GB heap)' : `${browser.name} can't run the in-tab prover — Chrome / Safari / Edge / Brave hit a 4 GB WASM heap cap. Use Firefox or run the CLI.`}
              />

              <Stat
                label="prover server"
                value={
                  cliStatus === 'detecting' ? 'detecting…' :
                  cliStatus === 'present' ? 'CLI @ :9080' :
                  'not running'
                }
                state={
                  cliStatus === 'present' ? 'ok' :
                  cliStatus === 'detecting' ? 'on' :
                  'idle'
                }
                hint={
                  cliStatus === 'present'
                    ? '@zkqes/cli detected on localhost:9080 — fast-path prove via rapidsnark (~14 s, 3.7 GiB peak). Bypasses the 38 GB browser path.'
                    : 'Run `npm i -g @zkqes/cli && zkqes serve` to enable a 14-second prove on any laptop. Without the CLI, browser proving needs Firefox + 38 GB RAM.'
                }
              />

              <Stat
                label="memory required"
                value="38 GB"
                state="on"
                hint="In-tab snarkjs needs ~38 GB peak heap during the witness + prove pass. We can't read your RAM from JS — verify locally before kicking off browser-prove."
              />

              <Stat
                label="ready to prove"
                value={proverFeasible ? 'yes' : 'no'}
                state={proverFeasible ? 'ok' : 'err'}
                hint={
                  proverFeasible
                    ? proverReady
                      ? 'CLI fast-path will be used.'
                      : 'Browser will fall back to in-tab snarkjs (Firefox + 38 GB).'
                    : 'No usable prove path. Install @zkqes/cli or switch to Firefox on a 38 GB-RAM machine.'
                }
              />

              {isConnected && (
                <Stat
                  label="bindings"
                  value={bindingsLoading ? '…' : String(bindingsCount)}
                  state={bindingsCount > 0 ? 'ok' : 'on'}
                  mono
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CurveConnectButton />
            </div>
          </div>
        </section>

        {/* REGISTER FLOW — Step2-4 inline (Step1 = wallet connect lives in status bar) */}
        <section className="cv-card is-stripe" style={{ padding: '14px 16px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 10 }}>
            <span className="cv-ix">{`0${step}`}</span>
            <span>REGISTER · file a binding</span>
            <span style={{ flex: 1 }} />
            <StepDots current={step} />
            {isConnected && step > 1 && (
              <button onClick={reset} className="cv-btn is-sm is-ghost">
                ✕ reset
              </button>
            )}
          </div>

          <div className="ct" style={{ background: 'var(--cv-card)', border: '2px solid var(--cv-ink)', padding: '14px 16px' }}>
            {!isConnected ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                fontFamily: 'var(--cv-mono)', fontSize: 13.5,
              }}>
                <span style={{
                  fontFamily: 'var(--cv-display)', fontSize: 26,
                  color: 'var(--cv-ua-blue)', lineHeight: 1,
                }}>
                  CONNECT A WALLET TO BEGIN.
                </span>
                <span style={{ color: 'var(--cv-mute)' }}>
                  Use the connect button in the status bar above. The wallet
                  signs only the final anchor transaction; QES does the
                  identity proof.
                </span>
              </div>
            ) : (
              <>
                {step === 1 && (
                  <>
                    <Step2GenerateBinding
                      onAdvance={(bytes) => {
                        setBindingBytes(bytes);
                        setStep(2);
                      }}
                      onBack={reset}
                      hideBack
                    />
                    <div style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        onClick={() => {
                          reset();
                          disconnect();
                        }}
                        className="cv-btn is-ghost"
                      >
                        ↪ Disconnect wallet
                      </button>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <Step3DiiaSign
                    onP7s={(bytes) => {
                      setP7s(bytes);
                      setStep(3);
                    }}
                    onBack={() => setStep(1)}
                    {...(bindingBytes ? { bindingBytes } : {})}
                  />
                )}
                {(step === 3 || step === 4) && p7s && bindingBytes && (
                  <Step4ProveAndRegister
                    p7s={p7s}
                    bindingBytes={bindingBytes}
                    onBack={() => setStep(step === 4 ? 3 : 2)}
                    ageOptIn={ageOptIn}
                    onAgeOptInChange={setAgeOptIn}
                    ageCutoffYmd={ageCutoffYmd}
                    onAgeCutoffYmdChange={setAgeCutoffYmd}
                    phase={step === 4 ? 'review' : 'prove'}
                    onProveComplete={() => setStep(4)}
                  />
                )}
              </>
            )}
          </div>
        </section>

        {/* BINDINGS TABLE */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>BINDINGS · Base Sepolia</span>
            <span style={{ flex: 1 }} />
            {isConnected
              ? <span className="cv-pill">{bindingsLoading ? 'loading' : `${bindingsCount} active`}</span>
              : <span className="cv-pill" style={{ color: 'var(--cv-mute)' }}>connect to read</span>}
          </div>
          {!isConnected ? (
            <div style={{ padding: '14px 4px', fontSize: 12, color: 'var(--cv-mute)' }}>
              connect to read on-chain bindings.
            </div>
          ) : bindingsLoading ? (
            <div style={{ padding: '14px 4px', fontSize: 12, color: 'var(--cv-mute)' }}>
              reading Base Sepolia logs…
            </div>
          ) : bindingsCount === 0 ? (
            <div style={{ padding: '14px 4px', fontSize: 12, color: 'var(--cv-mute)' }}>
              none. use the register card above to file the first.
            </div>
          ) : (
            <table className="cv-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>binding ID</th>
                  <th>state</th>
                  <th>actions</th>
                </tr>
              </thead>
              <tbody>
                {bindings?.map((id, i) => (
                  <tr key={id}>
                    <td><b>{String(i + 1).padStart(2, '0')}</b></td>
                    <td style={{ fontFamily: 'var(--cv-mono)', fontSize: 11.5 }}>
                      {id.slice(0, 14)}…{id.slice(-6)}
                    </td>
                    <td><span className="cv-pill is-ok">active</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <Link to="/account/prove-age" className="cv-btn is-sm is-ghost">▷ prove-age</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* SECONDARY ACTIONS — terse buttons */}
        <section className="cv-card" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span style={{
              fontSize: 10.5, letterSpacing: '.14em', color: 'var(--cv-mute)',
              textTransform: 'uppercase', marginRight: 6,
            }}>
              actions
            </span>
            <Link to="/account/prove-age" className="cv-btn is-sm">▷ Prove age</Link>
            <Link to="/verify" className="cv-btn is-sm is-ghost">↗ Verify</Link>
            <Link to="/ua/cli" className="cv-btn is-sm is-ghost">
              {proverReady ? '✓ CLI ready' : '$ install @zkqes/cli'}
            </Link>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--cv-mute)', fontFamily: 'var(--cv-mono)', fontSize: 11 }}>
              proof ~20 KB · verify ~230k gas · circuit ~3.9M
            </span>
          </div>
        </section>

      </div>
    </main>
  );
}

/**
 * Curve-styled wallet button — wraps RainbowKit's ConnectButton.Custom
 * so the trigger renders with the same .cv-btn shadow + border + font
 * as everything else on the page. The connect / chain / account modals
 * themselves are themed via `curveTheme` in WalletProvider.tsx.
 */
function CurveConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        if (!ready) {
          return <span className="cv-btn is-sm" style={{ opacity: 0.5 }}>● loading…</span>;
        }
        if (!account || !chain) {
          return (
            <button onClick={openConnectModal} className="cv-btn">
              ▶ Connect wallet
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button onClick={openChainModal} className="cv-btn" style={{ background: 'var(--cv-err)' }}>
              ⚠ Wrong network
            </button>
          );
        }
        return (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button onClick={openChainModal} className="cv-btn is-sm">
              {chain.iconUrl
                ? <img src={chain.iconUrl} alt="" style={{ width: 14, height: 14 }} />
                : null}
              {chain.name}
            </button>
            <button onClick={openAccountModal} className="cv-btn is-sm" style={{ fontFamily: 'var(--cv-mono)' }}>
              {account.displayName}
              {account.displayBalance ? ` · ${account.displayBalance}` : ''}
            </button>
          </span>
        );
      }}
    </ConnectButton.Custom>
  );
}

function Stat({ label, value, state, mono, hint }: {
  label: string; value: string;
  state: 'ok' | 'err' | 'on' | 'idle';
  mono?: boolean;
  hint?: string;
}) {
  const dotColor =
    state === 'ok' ? '#2e7d32' :
    state === 'err' ? '#c62828' :
    state === 'idle' ? '#6b6558' :
    'var(--cv-ua-blue)';
  const valueColor =
    state === 'err' ? '#c62828' :
    state === 'idle' ? '#6b6558' :
    state === 'ok' ? '#2e7d32' :
    'var(--cv-ink)';
  return (
    <span
      title={hint}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: hint ? 'help' : 'default' }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 0,
        background: dotColor, border: '1.5px solid var(--cv-ink)', flex: 'none',
      }} />
      <span style={{
        fontSize: 9.5, letterSpacing: '.14em', color: 'var(--cv-mute)',
        textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--cv-mono)' : 'var(--cv-mono)',
        fontSize: 12, fontWeight: 700, color: valueColor,
        letterSpacing: '.02em',
      }}>{value}</span>
    </span>
  );
}

function StepDots({ current }: { current: StepNumber }) {
  const all = [1, 2, 3, 4] as const;
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {all.map((n) => (
        <span key={n} style={{
          width: 10, height: 10,
          background: n < current ? 'var(--cv-ua-blue)' : n === current ? 'var(--cv-ua-yellow)' : 'transparent',
          border: '1.5px solid var(--cv-ink)',
        }} />
      ))}
      <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--cv-mute)', letterSpacing: '.08em' }}>
        {current} / 4
      </span>
    </span>
  );
}

