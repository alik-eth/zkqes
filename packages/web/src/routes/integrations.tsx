// /integrations — Curve-2021 developer integration guide.
//
// Three language paths (Solidity · TypeScript · Rust placeholder) +
// deployed registries table + use-cases tile + footer stats.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ZKQES_REGISTRY_UA } from '@zkqes/sdk';

import { TopBar } from '../components/curve/TopBar';
import '../styles/curve.css';

const SOLIDITY = `forge install alik-eth/zkqes

// in your contract:
import { Verified, IZkqesRegistry } from "@zkqes/contracts-sdk/Verified.sol";

contract MyDApp is Verified {
    constructor(IZkqesRegistry r) Verified(r) {}

    function privileged() external onlyVerifiedUkrainian {
      /* ... */
    }
}`;

const TYPESCRIPT = `npm install @zkqes/sdk viem

// in your app:
import { isVerified, ZKQES_REGISTRY_UA } from '@zkqes/sdk';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http() });
const ok = await isVerified(
  client,
  ZKQES_REGISTRY_UA.base.registry,
  walletAddress,
); // → boolean`;

const RUST = `// status: planned · contributions welcome
// github.com/alik-eth/zkqes/issues/new?labels=rust-sdk
//
// the lookup primitive is one ABI call:
//   getEoaBinding(client, registry, addr) → Binding | null
// — same shape as the TypeScript SDK; viem-equivalent client.

cargo add zkqes-sdk         // not yet published`;

const USECASES = [
  ['Sybil-proof airdrops', 'One identity, one claim. Drop tokens to verified Ukrainians without seeing addresses tied to people.', 'dao'],
  ['1-person-1-vote DAO', 'Quadratic voting against a Sybil-proof set. Sybil-resistant, accountable.', 'dao'],
  ['Selective-disclosure LP / KYC pool', 'Pool participation gated on qualified identity, no PII on chain.', 'defi'],
  ['Civic petitions on-chain', 'Citizen petitions where the signature trail is auditable but not deanonymising.', 'civic'],
] as const;

export function IntegrationsScreen() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="integrations"
        statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● dev integration</span>}
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <BackLink />

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">{'<>'}</span>
            <span>INTEGRATIONS · GATE YOUR CONTRACT OR APP ON QUALIFIED IDENTITY</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">~230k gas</span>
            <span className="cv-pill">~20 KB proof</span>
            <span className="cv-pill is-ok">MIT</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 138 }}>
                INTEGRATE<span className="b">.</span><br />
                <span className="y">IN MINUTES.</span>
              </h1>
              <p style={{ maxWidth: 700, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
                One ABI call. Drop <code style={{ background: 'var(--cv-ua-yellow)', padding: '1px 6px', border: '1.5px solid var(--cv-ink)' }}>onlyVerifiedUkrainian</code> on
                a function and your contract gates on a state-grade qualified identity — without seeing
                names, addresses, certificates, or anything else. Solidity for the contract side,
                TypeScript+viem for the client side, Rust on the way.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <span className="cv-sticker">free · forever</span>
              <a href="https://github.com/alik-eth/zkqes" rel="noopener noreferrer"
                 className="cv-btn is-lg" style={{ minWidth: 240, justifyContent: 'center' }}>
                ↗ github.com/zkqes
              </a>
              <a href="https://docs.zkqes.org" rel="noopener noreferrer"
                 className="cv-btn is-blue is-lg" style={{ minWidth: 240, justifyContent: 'center' }}>
                ↗ full reference
              </a>
            </div>
          </div>
        </section>

        {/* LANGUAGE PATHS */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          PICK A LANGUAGE.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          The lookup is one read on the deployed registry. Same primitive across all stacks.
        </p>

        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <CodeCard n="01" lang="Solidity" subtitle="onchain · forge" code={SOLIDITY} accent="paper" status="ready" />
          <CodeCard n="02" lang="TypeScript" subtitle="client · viem" code={TYPESCRIPT} accent="yellow" status="ready" />
          <CodeCard n="03" lang="Rust" subtitle="planned · contributions welcome" code={RUST} accent="blue" status="planned" />
        </section>

        {/* DEPLOYED REGISTRIES */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>DEPLOYED REGISTRIES · the address you wire your client to</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill">audit · pending Q3</span>
          </div>
          {Object.keys(ZKQES_REGISTRY_UA).length === 0 ? (
            <div style={{ padding: '18px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
              No deployments listed yet. Mainnet deploys post-ceremony close + audit.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table className="cv-table">
              <thead>
                <tr><th>network</th><th>chain id</th><th>registry</th><th>verifier</th><th>links</th></tr>
              </thead>
              <tbody>
                {Object.entries(ZKQES_REGISTRY_UA).map(([k, v]) => {
                  const dep = v as { registry?: string; chainId?: number; explorerBase?: string; verifier?: string };
                  return (
                    <tr key={k}>
                      <td><b>{k}</b></td>
                      <td style={{ color: 'var(--cv-mute)' }}>{dep.chainId ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--cv-mono)', fontSize: 11 }}>
                        {dep.registry ? <>{dep.registry.slice(0, 10)}…{dep.registry.slice(-6)}</> : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--cv-mono)', fontSize: 11 }}>
                        {dep.verifier ? <>{dep.verifier.slice(0, 10)}…{dep.verifier.slice(-6)}</> : '—'}
                      </td>
                      <td>
                        {dep.explorerBase && dep.registry ? (
                          <a href={`${dep.explorerBase}/address/${dep.registry}`} rel="noopener noreferrer"
                             className="cv-btn is-sm is-ghost">↗ explorer</a>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </section>

        {/* USE CASES */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          BUILT FOR.
        </h2>
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {USECASES.map(([title, body, tag], i) => (
            <div key={title} className={`cv-card ${i === 0 ? 'is-yellow' : 'is-paper'}`}>
              <div className="cv-cardhead">
                <span className="cv-ix">0{i + 1}</span>
                <span style={{ flex: 1 }} />
                <span className="cv-pill">{tag}</span>
              </div>
              <div style={{ fontFamily: 'var(--cv-display)', fontSize: 22, color: 'var(--cv-ua-blue)', lineHeight: 1.1 }}>
                {title}
              </div>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 10 }}>{body}</p>
            </div>
          ))}
        </section>

        {/* COSTS */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          COSTS.
        </h2>
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <FooterStat label="proof size" value="~20" suffix="KB" />
          <FooterStat label="verify gas" value="~230" suffix="k base" yellow />
          <FooterStat label="register gas" value="~600" suffix="k base" />
          <FooterStat label="dependencies" value="0" suffix="trust assumptions added" blue />
        </section>

      </div>
    </main>
  );
}

function CodeCard({ n, lang, subtitle, code, accent, status }: {
  n: string; lang: string; subtitle: string; code: string;
  accent: 'paper' | 'yellow' | 'blue'; status: 'ready' | 'planned';
}) {
  const [copied, setCopied] = useState(false);
  const isBlue = accent === 'blue';
  const cls = accent === 'paper' ? 'is-paper' : accent === 'yellow' ? 'is-yellow' : 'is-blue';
  return (
    <div className={`cv-card ${cls}`}>
      <div className="cv-cardhead" style={isBlue ? { color: '#fff' } : undefined}>
        <span className="cv-ix">{n}</span>
        <span>{lang}</span>
        <span style={{ flex: 1 }} />
        <span className={`cv-pill ${status === 'ready' ? 'is-ok' : ''}`}>{status}</span>
      </div>
      <div style={{ fontSize: 11, color: isBlue ? 'var(--cv-ua-yellow)' : 'var(--cv-mute)', letterSpacing: '.06em', marginBottom: 10, textTransform: 'uppercase' }}>{subtitle}</div>
      <div style={{ position: 'relative' }}>
        <pre style={{
          background: '#0d0d0d', color: '#e8e2cc',
          border: '2px solid var(--cv-ink)',
          margin: 0, padding: '12px 14px', paddingRight: 80,
          fontFamily: 'var(--cv-mono)', fontSize: 11.5, lineHeight: 1.55,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          minHeight: 240,
        }}>{code}</pre>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="cv-btn is-sm"
          style={{ position: 'absolute', top: 8, right: 8 }}
        >
          {copied ? '✓ copied' : '📋 copy'}
        </button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" style={{
      fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-ua-blue)',
      textDecoration: 'underline', textUnderlineOffset: 3,
    }}>
      ← back
    </Link>
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
