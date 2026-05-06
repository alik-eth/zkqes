// /verify — Curve-2021 brutalist, live-wired binding lookup.
//
// Public verifier. No wallet, no SAB context, no snarkjs. Instantiates
// its own viem PublicClient against Base Sepolia and queries the V5.4
// registry by event-log scan for an EOA, or direct `getBinding(id)` for
// a 32-byte bindingId. Returns a full result card or an honest empty
// state.
//
// sharedRoutes — visible on both landing and app builds.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPublicClient,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type PublicClient,
} from 'viem';
import { baseSepolia } from 'viem/chains';

import { zkqesRegistryUaAbi } from '@zkqes/sdk';
import baseSepoliaDeploy from '../../../../fixtures/contracts/base-sepolia.json';
import { TopBar } from '../components/curve/TopBar';

import '../styles/curve.css';

const REGISTRY_V5_4: Address = (baseSepoliaDeploy as { v5_4?: { registry?: string } })
  .v5_4?.registry as Address ?? '0x262D017051196F8C686BFBa00Cbbe2BD5B055491';

const DEPLOY_BLOCK: bigint = BigInt(
  (baseSepoliaDeploy as { v5_4?: { deployBlock?: number } }).v5_4?.deployBlock ?? 41115149,
);

const RPC_URL = 'https://sepolia.base.org';

// Public RPC at sepolia.base.org caps eth_getLogs at a 10k-block range.
// Chunk anything wider into 9999-block windows. The helper takes a
// per-window callback so call sites preserve viem's typed event-arg
// inference.
const LOG_CHUNK = 9999n;

async function chunkBlocks<T>(
  fromBlock: bigint,
  toBlock: bigint,
  fetchOne: (from: bigint, to: bigint) => Promise<readonly T[]>,
): Promise<T[]> {
  const out: T[] = [];
  let from = fromBlock;
  while (from <= toBlock) {
    const to = from + LOG_CHUNK > toBlock ? toBlock : from + LOG_CHUNK;
    out.push(...(await fetchOne(from, to)));
    from = to + 1n;
  }
  return out;
}

type Stage = 'idle' | 'invalid' | 'searching' | 'not-found' | 'found' | 'error';

interface BindingRow {
  readonly id: `0x${string}`;
  readonly pk: Address;
  readonly nullifier: bigint;
  readonly timestamp: bigint;
  readonly revoked: boolean;
  readonly dobSupported: boolean;
}

const BindingRegisteredEvt = parseAbiItem(
  'event BindingRegistered(bytes32 indexed id, address indexed pk, uint256 nullifier, uint8 dobSupported)',
);

const BindingRotatedEvt = parseAbiItem(
  'event BindingRotated(bytes32 indexed id, address indexed oldPk, address indexed newPk)',
);

export function VerifyBindingScreen() {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [results, setResults] = useState<readonly BindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [recent, setRecent] = useState<readonly BindingRow[]>([]);
  const clientRef = useRef<PublicClient | null>(null);

  const client = useMemo(() => {
    if (clientRef.current) return clientRef.current;
    const c = createPublicClient({
      chain: baseSepolia,
      transport: http(RPC_URL),
    }) as PublicClient;
    clientRef.current = c;
    return c;
  }, []);

  // Tick clock for the timestamp pill
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Recent bindings feed — all BindingRegistered events since deploy
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await client.getBlockNumber();
        const logs = await chunkBlocks(DEPLOY_BLOCK, latest, (from, to) =>
          client.getLogs({
            address: REGISTRY_V5_4,
            event: BindingRegisteredEvt,
            fromBlock: from,
            toBlock: to,
          }),
        );
        if (cancelled) return;
        const rows: BindingRow[] = [];
        for (const log of logs.slice(-15).reverse()) {
          const block = await client.getBlock({ blockHash: log.blockHash });
          if (cancelled) return;
          rows.push({
            id: log.args.id as `0x${string}`,
            pk: log.args.pk as Address,
            nullifier: log.args.nullifier as bigint,
            timestamp: block.timestamp,
            revoked: false,
            dobSupported: Number(log.args.dobSupported ?? 0) > 0,
          });
        }
        if (!cancelled) setRecent(rows);
      } catch {
        // silent — recent feed is best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  const onVerify = async () => {
    const trimmed = query.trim();
    setError(null);
    setResults([]);
    if (trimmed === '') {
      setStage('idle');
      return;
    }
    const isBindingId = /^0x[0-9a-fA-F]{64}$/.test(trimmed);
    const isAddr = isAddress(trimmed);
    if (!isBindingId && !isAddr) {
      setStage('invalid');
      return;
    }
    setStage('searching');
    try {
      if (isBindingId) {
        const binding = await client.readContract({
          address: REGISTRY_V5_4,
          abi: zkqesRegistryUaAbi,
          functionName: 'getBinding',
          args: [trimmed as `0x${string}`],
        }) as {
          pk: Address; ctxHash: bigint; policyLeafHash: bigint;
          timestamp: bigint; dobCommit: bigint; dobSupported: number;
          revoked: boolean; nullifier: bigint;
        };
        if (binding.pk === '0x0000000000000000000000000000000000000000') {
          setStage('not-found');
          return;
        }
        setResults([{
          id: trimmed as `0x${string}`,
          pk: binding.pk,
          nullifier: binding.nullifier,
          timestamp: binding.timestamp,
          revoked: binding.revoked,
          dobSupported: binding.dobSupported > 0,
        }]);
        setStage('found');
        return;
      }
      // Address path — scan logs both as registered pk and as rotation target.
      // Chunked to satisfy public RPC's 10k-block range cap.
      const latest = await client.getBlockNumber();
      const [registeredLogs, rotatedInLogs, rotatedOutLogs] = await Promise.all([
        chunkBlocks(DEPLOY_BLOCK, latest, (from, to) =>
          client.getLogs({
            address: REGISTRY_V5_4,
            event: BindingRegisteredEvt,
            args: { pk: trimmed as Address },
            fromBlock: from,
            toBlock: to,
          }),
        ),
        chunkBlocks(DEPLOY_BLOCK, latest, (from, to) =>
          client.getLogs({
            address: REGISTRY_V5_4,
            event: BindingRotatedEvt,
            args: { newPk: trimmed as Address },
            fromBlock: from,
            toBlock: to,
          }),
        ),
        chunkBlocks(DEPLOY_BLOCK, latest, (from, to) =>
          client.getLogs({
            address: REGISTRY_V5_4,
            event: BindingRotatedEvt,
            args: { oldPk: trimmed as Address },
            fromBlock: from,
            toBlock: to,
          }),
        ),
      ]);
      const owned = new Set<string>();
      for (const l of registeredLogs) owned.add(l.args.id as string);
      for (const l of rotatedInLogs) owned.add(l.args.id as string);
      for (const l of rotatedOutLogs) owned.delete(l.args.id as string);
      if (owned.size === 0) {
        setStage('not-found');
        return;
      }
      const rows: BindingRow[] = [];
      for (const id of owned) {
        const b = await client.readContract({
          address: REGISTRY_V5_4,
          abi: zkqesRegistryUaAbi,
          functionName: 'getBinding',
          args: [id as `0x${string}`],
        }) as {
          pk: Address; ctxHash: bigint; policyLeafHash: bigint;
          timestamp: bigint; dobCommit: bigint; dobSupported: number;
          revoked: boolean; nullifier: bigint;
        };
        rows.push({
          id: id as `0x${string}`,
          pk: b.pk,
          nullifier: b.nullifier,
          timestamp: b.timestamp,
          revoked: b.revoked,
          dobSupported: b.dobSupported > 0,
        });
      }
      setResults(rows);
      setStage('found');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar active="verify" statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● live registry</span>} />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">?</span>
            <span>VERIFY · IS THIS WALLET BOUND TO A QUALIFIED IDENTITY</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">Base Sepolia · live</span>
            <span className="cv-pill" style={{ fontFamily: 'var(--cv-mono)' }}>{REGISTRY_V5_4.slice(0, 8)}…{REGISTRY_V5_4.slice(-4)}</span>
            <span className="cv-pill">{now.toLocaleTimeString('en-GB', { hour12: false })}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 138 }}>
                IS IT<br />
                <span className="b">REAL</span><span className="y">?</span>
              </h1>
              <p style={{ maxWidth: 700, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
                Paste a wallet address or a 32-byte binding ID. We query the
                ZKQESRegistry on Base Sepolia directly from your browser — no
                server, no proxy, no telemetry. The result is the chain's
                opinion, verbatim.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <span className="cv-sticker">runs in this tab</span>
              <span style={{ fontSize: 10.5, color: 'var(--cv-mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                paste anything below ↓
              </span>
            </div>
          </div>
        </section>

        {/* PASTE STRIP */}
        <section className="cv-card is-paper" style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18, alignItems: 'center', marginBottom: 12 }}>
            <div className="cv-cardhead" style={{ margin: 0 }}>
              <span className="dot live" />
              <span>QUERY</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--cv-mute)' }}>
              Accepts: <code style={{ background: '#FFD700', padding: '1px 5px', border: '1.5px solid var(--cv-ink)' }}>0x…40 hex</code> wallet · <code style={{ background: '#FFD700', padding: '1px 5px', border: '1.5px solid var(--cv-ink)' }}>0x…64 hex</code> binding ID
            </div>
            <span className="cv-pill is-blue">getBinding · getLogs</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <input
              data-testid="verify-binding-input"
              placeholder="0x91A2…fE  · or a 32-byte binding id"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onVerify(); }}
              autoComplete="off"
              spellCheck={false}
              style={{
                padding: '14px 16px', border: '2px solid var(--cv-ink)',
                fontFamily: 'var(--cv-mono)', fontSize: 18, background: '#fff',
                boxShadow: 'inset 3px 3px 0 rgba(0,0,0,.06)',
              }}
            />
            <button data-testid="verify-binding-submit" className="cv-btn is-lg" onClick={onVerify}>
              {stage === 'searching' ? '⟳ Searching…' : '▶ Verify'}
            </button>
          </div>
        </section>

        {/* RESULT + WHAT-YOU-(WONT)-LEARN */}
        <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <ResultCard stage={stage} results={results} error={error} query={query} />
          <PrivacyCard />
        </section>

        {/* RECENT BINDINGS */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span className="dot live" />
            <span>RECENT BINDINGS · last {recent.length} on this registry</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill">auto-updating</span>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: '24px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
              Reading recent BindingRegistered events from {RPC_URL.replace('https://', '')}…
            </div>
          ) : (
            <table className="cv-table">
              <thead>
                <tr><th>#</th><th>time</th><th>binding ID</th><th>wallet</th><th>state</th><th>actions</th></tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={r.id}>
                    <td><b>{String(i + 1).padStart(2, '0')}</b></td>
                    <td style={{ color: 'var(--cv-mute)' }}>{new Date(Number(r.timestamp) * 1000).toLocaleString('en-GB', { hour12: false })}</td>
                    <td style={{ fontFamily: 'var(--cv-mono)' }}>{r.id.slice(0, 10)}…{r.id.slice(-4)}</td>
                    <td style={{ fontFamily: 'var(--cv-mono)' }}>{r.pk.slice(0, 8)}…{r.pk.slice(-4)}</td>
                    <td>
                      {r.revoked
                        ? <span className="cv-pill is-err">revoked</span>
                        : <span className="cv-pill is-ok">active</span>}
                      {r.dobSupported && <span className="cv-pill is-ua" style={{ marginLeft: 4 }}>DOB</span>}
                    </td>
                    <td>
                      <button className="cv-btn is-sm is-ghost" onClick={() => { setQuery(r.pk); setTimeout(onVerify, 0); }}>
                        ↗ inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* FOOTER STATS */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat
            label="registry · ↗ basescan"
            value={`${REGISTRY_V5_4.slice(0, 6)}…${REGISTRY_V5_4.slice(-4)}`}
            suffix="V5.4"
            mono
            href={`https://sepolia.basescan.org/address/${REGISTRY_V5_4}`}
          />
          <FooterStat label="rpc endpoint" value="sepolia.base.org" suffix="public" yellow mono />
          <FooterStat label="bindings · live feed" value={String(recent.length)} suffix="recent" />
          <FooterStat label="network" value="Base Sepolia" suffix="84532" blue />
        </section>

      </div>
    </main>
  );
}

/* — primitives — */

function ResultCard({ stage, results, error, query }: {
  stage: Stage; results: readonly BindingRow[]; error: string | null; query: string;
}) {
  if (stage === 'idle') {
    return (
      <div className="cv-card is-paper" style={{ minHeight: 260, display: 'flex', flexDirection: 'column' }}>
        <div className="cv-cardhead">
          <span className="dot" />
          <span>RESULT · idle</span>
        </div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, color: 'var(--cv-mute)' }}>
          <div>
            <div style={{ fontFamily: 'var(--cv-display)', fontSize: 64, color: 'var(--cv-ua-blue)', lineHeight: 1 }}>·</div>
            <div style={{ fontSize: 13, marginTop: 12 }}>
              No query yet. Paste an address or binding ID above and press <b>▶ Verify</b>.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (stage === 'invalid') {
    return (
      <div className="cv-card is-yellow">
        <div className="cv-cardhead">
          <span>RESULT · invalid query</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-err">REJECTED</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>
          <b>"{query.slice(0, 40)}{query.length > 40 ? '…' : ''}"</b> is not a valid
          Ethereum address (40 hex) nor a binding ID (64 hex). Try pasting again.
        </div>
      </div>
    );
  }
  if (stage === 'searching') {
    return (
      <div className="cv-card is-blue">
        <div className="cv-cardhead" style={{ color: '#fff' }}>
          <span className="dot live" />
          <span>RESULT · searching the registry</span>
        </div>
        <div className="cv-bar" style={{ marginTop: 8 }}><i style={{ width: '70%' }} /></div>
        <div style={{ fontSize: 12, marginTop: 10, opacity: .85 }}>
          Scanning <code style={{ background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)', padding: '1px 6px' }}>BindingRegistered</code> + <code style={{ background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)', padding: '1px 6px' }}>BindingRotated</code> logs · this can take a few seconds on cold cache.
        </div>
      </div>
    );
  }
  if (stage === 'error') {
    return (
      <div className="cv-card" style={{ background: 'var(--cv-err)', boxShadow: '4px 4px 0 var(--cv-ink)' }}>
        <div className="cv-cardhead">
          <span>RESULT · rpc error</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-err">ERROR</span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, fontFamily: 'var(--cv-mono)', wordBreak: 'break-all' }}>
          {error}
        </div>
      </div>
    );
  }
  if (stage === 'not-found') {
    return (
      <div className="cv-card is-paper">
        <div className="cv-cardhead">
          <span>RESULT · no binding</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill">NOT FOUND</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 4px' }}>
          <div className="cv-num" style={{ color: 'var(--cv-ua-blue)', fontSize: 72 }}>∅</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            <b>{query.slice(0, 14)}…{query.slice(-4)}</b> is not bound to any
            qualified identity on this registry.
            <br /><br />
            <span style={{ color: 'var(--cv-mute)' }}>
              This is the truth from the chain — not "we couldn't reach it." If
              this wallet expected a binding, check the address and the network
              (Base Sepolia, registry <code>{REGISTRY_V5_4.slice(0, 8)}…</code>).
            </span>
          </div>
        </div>
      </div>
    );
  }
  // found
  return (
    <div className="cv-card is-paper">
      <div className="cv-cardhead">
        <span className="dot live" />
        <span>RESULT · {results.length} binding{results.length === 1 ? '' : 's'} found</span>
        <span style={{ flex: 1 }} />
        <span className="cv-pill is-ok">VALID · ON-CHAIN</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map((r) => (
          <div key={r.id} style={{
            border: '2px solid var(--cv-ink)',
            background: r.revoked ? 'var(--cv-err)' : 'var(--cv-ua-yellow)',
            padding: '12px 14px',
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--cv-display)', fontSize: 22, color: 'var(--cv-ua-blue)', wordBreak: 'break-all' }}>
                {r.id}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 4, columnGap: 8, fontSize: 12, marginTop: 8 }}>
                <Field label="wallet">{r.pk}</Field>
                <Field label="nullifier">{`0x${r.nullifier.toString(16).padStart(64, '0').slice(0, 14)}…${r.nullifier.toString(16).padStart(64, '0').slice(-4)}`}</Field>
                <Field label="registered">{new Date(Number(r.timestamp) * 1000).toISOString().slice(0, 19).replace('T', ' ')}Z</Field>
                <Field label="dob attested">{r.dobSupported ? 'yes' : 'no'}</Field>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.revoked
                ? <span className="cv-pill is-err">REVOKED</span>
                : <span className="cv-pill is-ok">ACTIVE</span>}
              <a className="cv-btn is-sm" href={`https://sepolia.basescan.org/address/${r.pk}`} rel="noopener noreferrer">
                ↗ basescan
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyCard() {
  return (
    <div className="cv-card is-blue">
      <div className="cv-cardhead" style={{ color: '#fff' }}>
        <span>WHAT YOU CAN'T LEARN · ever</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
        {[
          'Whose qualified identity is bound to this wallet',
          'Which QTSP issued the underlying QES',
          'Which country the holder is from',
          'Any document the QES has ever signed',
          'Whether the holder is the same person across two bindings',
        ].map((t) => (
          <li key={t} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--cv-display)', fontSize: 18, color: 'var(--cv-ua-yellow)' }}>✕</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <div className="cv-hatch" style={{ margin: '14px -16px', borderColor: 'var(--cv-ua-yellow)' }} />
      <div style={{ fontSize: 11, opacity: .85 }}>
        Pseudonymity is preserved by the circuit. Accountability — the QTSP can identify the holder under lawful process — is preserved by the law.
      </div>
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

function FooterStat({ label, value, suffix, yellow, blue, mono, href }: {
  label: string; value: string; suffix?: string;
  yellow?: boolean; blue?: boolean; mono?: boolean; href?: string;
}) {
  const cls = yellow ? 'is-yellow' : blue ? 'is-blue' : '';
  const body = (
    <>
      <div className="cv-cardhead" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>{label}</div>
      <div className="cv-num sm" style={{ ...(blue ? { color: 'var(--cv-ua-yellow)' } : {}), ...(mono ? { fontFamily: 'var(--cv-mono)', fontSize: 18 } : {}) }}>
        {value} {suffix && <span style={{ fontSize: 16 }}>{suffix}</span>}
      </div>
    </>
  );
  if (href) {
    return (
      <a className={`cv-card ${cls}`} href={href} target="_blank" rel="noopener noreferrer"
         style={{ padding: '10px 14px', textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {body}
      </a>
    );
  }
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '10px 14px' }}>
      {body}
    </div>
  );
}
