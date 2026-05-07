// app.zkqes.org `/` — terminal-style control room.
//
// Terse: status bar, the actual register flow inline, bindings table,
// secondary action row. No hero. No marketing copy. No "what is this".
// Click the action you want; it runs in this tab. Mounts Step1-4 in
// place — there is no /ua/registerV5 detour anymore.

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useChainId } from 'wagmi';

import { Step1ConnectWallet } from '../ua/v5/Step1ConnectWallet';
import { Step2GenerateBinding } from '../ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../ua/v5/Step4ProveAndRegister';
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

type StepNumber = 1 | 2 | 3 | 4;

export function HomeDocument() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const { phase } = useCeremonyPhase();
  const { status: cliStatus } = useCliPresence();
  const { data: bindings, isLoading: bindingsLoading } =
    useV5_4BindingsForWallet(address);

  const [step, setStep] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const chainName = chainId ? CHAIN_NAMES[chainId] ?? `chain ${chainId}` : '—';
  const onCorrectChain = chainId === 84532;
  const balanceFmt = balance
    ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}`
    : '—';
  const addrShort = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  const proverReady = cliStatus === 'present';
  const bindingsCount = bindings?.length ?? 0;

  const reset = () => {
    setStep(1);
    setBindingBytes(null);
    setP7s(null);
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="home"
        statusPill={
          addrShort ? (
            <span
              className="cv-pill"
              style={{ background: onCorrectChain ? 'var(--cv-ok)' : 'var(--cv-err)' }}
            >
              {addrShort} · {chainName}
            </span>
          ) : (
            <span
              className="cv-pill"
              style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}
            >
              ● not connected
            </span>
          )
        }
        extraNav={
          <Link
            to="/account/rotate"
            style={{ padding: '4px 10px', border: '2px solid transparent', color: '#f4f0e0', fontWeight: 500, fontSize: 13, textDecoration: 'none' }}
          >
            Account
          </Link>
        }
      />

      <div style={{ padding: '14px 22px 24px', display: 'grid', gap: 14 }}>

        {/* STATUS BAR — single row of pills, no prose */}
        <section className="cv-card is-paper" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
            <span className="cv-ix">▶</span>
            <span style={{ fontFamily: 'var(--cv-display)', fontSize: 18, color: 'var(--cv-ua-blue)', letterSpacing: '.04em' }}>
              app.zkqes.org
            </span>
            <span style={{ flex: 0, color: 'var(--cv-mute)', fontFamily: 'var(--cv-mono)' }}>·</span>
            <StatusPill label="wallet" value={addrShort ?? 'idle'} ok={isConnected} />
            <StatusPill label="chain" value={chainName} ok={onCorrectChain} warn={!onCorrectChain && isConnected} />
            <StatusPill label="balance" value={balanceFmt} />
            <StatusPill
              label="prover"
              value={proverReady ? 'CLI · 14s' : cliStatus === 'detecting' ? 'detecting' : 'browser · 5min'}
              ok={proverReady}
            />
            <StatusPill label="ceremony" value={phase ?? 'recruiting'} />
            <StatusPill label="bindings" value={bindingsLoading ? '…' : `${bindingsCount}`} ok={bindingsCount > 0} />
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--cv-mono)', color: 'var(--cv-mute)' }}>
              {now.toLocaleTimeString('en-GB', { hour12: false })}
            </span>
          </div>
        </section>

        {/* REGISTER FLOW — Step1-4 inline */}
        <section className="cv-card is-stripe" style={{ padding: '14px 16px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 10 }}>
            <span className="cv-ix">{String(step).padStart(2, '0')}</span>
            <span>REGISTER · file a binding</span>
            <span style={{ flex: 1 }} />
            <StepDots current={step} />
            {step > 1 && (
              <button onClick={reset} className="cv-btn is-sm is-ghost">
                ✕ reset
              </button>
            )}
          </div>

          <div style={{ background: 'var(--cv-card)', border: '2px solid var(--cv-ink)', padding: '14px 16px' }}>
            {step === 1 && (
              <Step1ConnectWallet onAdvance={() => setStep(2)} />
            )}
            {step === 2 && (
              <Step2GenerateBinding
                onAdvance={(bytes) => {
                  setBindingBytes(bytes);
                  setStep(3);
                }}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <Step3DiiaSign
                onP7s={(bytes) => {
                  setP7s(bytes);
                  setStep(4);
                }}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && p7s && bindingBytes && (
              <Step4ProveAndRegister
                p7s={p7s}
                bindingBytes={bindingBytes}
                onBack={() => setStep(3)}
              />
            )}
          </div>
        </section>

        {/* BINDINGS TABLE */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>BINDINGS · {chainName}</span>
            <span style={{ flex: 1 }} />
            {!isConnected ? (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button onClick={openConnectModal} className="cv-btn is-sm">
                    ▶ Connect wallet
                  </button>
                )}
              </ConnectButton.Custom>
            ) : (
              <span className="cv-pill">{bindingsLoading ? 'loading' : `${bindingsCount} active`}</span>
            )}
          </div>
          {!isConnected ? (
            <div style={{ padding: '14px 4px', fontSize: 12, color: 'var(--cv-mute)' }}>
              connect to read on-chain bindings.
            </div>
          ) : bindingsLoading ? (
            <div style={{ padding: '14px 4px', fontSize: 12, color: 'var(--cv-mute)' }}>
              reading {chainName} logs…
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
                      <Link to="/account/rotate" className="cv-btn is-sm is-ghost">⟲ rotate</Link>
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
            <Link to="/account/rotate" className="cv-btn is-sm">⟲ Rotate wallet</Link>
            <Link to="/account/prove-age" className="cv-btn is-sm">▷ Prove age</Link>
            <Link to="/verify" className="cv-btn is-sm is-ghost">↗ Verify</Link>
            <Link to="/ua/cli" className="cv-btn is-sm is-ghost">
              {proverReady ? '✓ CLI ready' : '$ install @zkqes/cli'}
            </Link>
            <Link to="/ceremony/contribute" className="cv-btn is-sm is-ghost">+ contribute to ceremony</Link>
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

function StatusPill({ label, value, ok, warn }: {
  label: string; value: string; ok?: boolean; warn?: boolean;
}) {
  const cls = ok ? 'cv-pill is-ok' : warn ? 'cv-pill is-err' : 'cv-pill';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{
        fontSize: 9.5, letterSpacing: '.12em', color: 'var(--cv-mute)',
        textTransform: 'uppercase',
      }}>{label}</span>
      <span className={cls} style={{ fontFamily: 'var(--cv-mono)' }}>{value}</span>
    </span>
  );
}

function StepDots({ current }: { current: StepNumber }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {([1, 2, 3, 4] as const).map((n) => (
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

