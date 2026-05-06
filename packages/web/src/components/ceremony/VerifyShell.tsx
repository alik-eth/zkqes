// /ceremony/verify — Curve-2021 hash inspector.
//
// Lookup a SHA-256 attestation hash against the published ceremony chain:
//   1. matches-final     → identical to status.finalZkeySha256
//   2. matches-contributor → identical to a contributor's attestation
//   3. unknown           → not part of this ceremony
//   4. invalid           → not a 64-hex string
//
// The by-wallet path lives at /verify (live on-chain via viem) so this
// surface is single-purpose: ceremony attestation lookup. Recent
// lookups persist to localStorage.

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';

import { TopBar } from '../curve/TopBar';
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

import '../../styles/curve.css';

const RECENT_KEY = 'qkb.demo.verify.recent.v2';
const RECENT_MAX = 10;
const HEX64_RE = /^0x?[0-9a-f]{64}$/i;

type Kind = 'idle' | 'invalid' | 'matches-final' | 'matches-contributor' | 'unknown' | 'feed-down';

interface AttestationResult {
  readonly kind: Kind;
  readonly hash?: string;
  readonly contributorName?: string;
  readonly round?: number;
}

interface RecentLookup {
  readonly query: string;
  readonly verdict: string;
  readonly at: string;
}

function readRecent(): readonly RecentLookup[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentLookup): readonly RecentLookup[] {
  const next = [entry, ...readRecent()].slice(0, RECENT_MAX);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); }
    catch { /* quota or disabled — recent log is best-effort */ }
  }
  return next;
}

function lookup(hash: string, status: CeremonyStatusPayload | null): AttestationResult {
  const trimmed = hash.trim().toLowerCase();
  if (!trimmed) return { kind: 'idle' };
  if (!HEX64_RE.test(trimmed)) return { kind: 'invalid', hash: trimmed };
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!status) return { kind: 'feed-down', hash: normalized };

  const stripped = normalized.replace(/^0x/, '');

  if (status.finalZkeySha256?.toLowerCase().replace(/^0x/, '') === stripped) {
    return { kind: 'matches-final', hash: normalized };
  }
  const match = status.contributors.find(
    (c) => c.attestation?.toLowerCase().replace(/^0x/, '') === stripped,
  );
  if (match) {
    return { kind: 'matches-contributor', hash: normalized, contributorName: match.name, round: match.round };
  }
  return { kind: 'unknown', hash: normalized };
}

export interface VerifyShellProps {
  readonly initialRecent?: readonly RecentLookup[];
  readonly skipLocalStorage?: boolean;
}

export function VerifyShell({ initialRecent, skipLocalStorage }: VerifyShellProps = {}) {
  const { status } = useCeremonyPhase();
  const [hashInput, setHashInput] = useState('');
  const [result, setResult] = useState<AttestationResult>({ kind: 'idle' });
  const [recent, setRecent] = useState<readonly RecentLookup[]>(initialRecent ?? []);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!skipLocalStorage) setRecent(readRecent());
  }, [skipLocalStorage]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function onVerify() {
    const r = lookup(hashInput, status);
    setResult(r);
    if (r.kind === 'idle') return;
    const verdict =
      r.kind === 'matches-final' ? 'matches published final zkey' :
      r.kind === 'matches-contributor' ? `round ${r.round} · ${r.contributorName}` :
      r.kind === 'feed-down' ? 'status feed unreachable' :
      r.kind === 'invalid' ? 'invalid hash format' :
      'not part of this ceremony';
    setRecent(pushRecent({
      query: hashInput.trim(),
      verdict,
      at: new Date().toISOString(),
    }));
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="ceremony"
        statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● attestation inspector</span>}
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>
        <BackLink />

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">#</span>
            <span>VERIFY · paste an attestation hash, see its place in the chain</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">SHA-256</span>
            <span className="cv-pill">{now.toLocaleTimeString('en-GB', { hour12: false })}</span>
          </div>
          <h1 className="cv-hero" style={{ fontSize: 138 }}>
            DID THIS<br />
            <span className="b">HASH</span> <span className="y">SHIP?</span>
          </h1>
          <p style={{ maxWidth: 700, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
            Drop a 64-hex SHA-256 attestation. We check it against the ceremony chain
            in your browser — both the per-round contributor attestations and the
            final zkey hash. Looking up a wallet binding instead?
            {' '}<Link to="/verify" className="cv-link">go to /verify ↗</Link>
          </p>
        </section>

        {/* PASTE STRIP */}
        <section className="cv-card is-paper" style={{ padding: '18px 22px' }}>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 18, alignItems: 'center', marginBottom: 12 }}>
            <div className="cv-cardhead" style={{ margin: 0 }}>
              <span className="dot live" />
              <span>QUERY</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--cv-mute)' }}>
              Accepts: <code style={{ background: '#FFD700', padding: '1px 5px', border: '1.5px solid var(--cv-ink)' }}>0x…64 hex</code> with or without the leading <code>0x</code>
            </div>
            <span className="cv-pill is-blue">runs in this tab</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <input
              data-testid="ceremony-verify-input"
              placeholder="0x9f81…  paste a SHA-256 attestation"
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onVerify(); }}
              autoComplete="off"
              spellCheck={false}
              style={{
                padding: '14px 16px', border: '2px solid var(--cv-ink)',
                fontFamily: 'var(--cv-mono)', fontSize: 18, background: '#fff',
                boxShadow: 'inset 3px 3px 0 rgba(0,0,0,.06)',
              }}
            />
            <button data-testid="ceremony-verify-submit" className="cv-btn is-lg" onClick={onVerify}>
              ▶ Verify
            </button>
          </div>
        </section>

        {/* RESULT + EXPLAINER */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <ResultCard result={result} query={hashInput} />
          <ExplainerCard />
        </section>

        {/* RECENT LOOKUPS */}
        <section className="cv-card is-paper">
          <div className="cv-cardhead">
            <span>RECENT LOOKUPS · last {recent.length} this session</span>
            <span style={{ flex: 1 }} />
            {recent.length > 0 && (
              <button
                className="cv-btn is-sm is-ghost"
                onClick={() => {
                  setRecent([]);
                  if (typeof localStorage !== 'undefined') localStorage.removeItem(RECENT_KEY);
                }}
              >
                clear
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: '18px 4px', fontSize: 13, color: 'var(--cv-mute)', textAlign: 'center' }}>
              No lookups yet. Verified hashes get logged here in your browser only.
            </div>
          ) : (
            <table className="cv-table">
              <thead>
                <tr><th>at</th><th>query</th><th>verdict</th></tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--cv-mute)' }}>{r.at.slice(11, 19)}</td>
                    <td style={{ fontFamily: 'var(--cv-mono)' }}>{r.query.slice(0, 18)}…{r.query.slice(-6)}</td>
                    <td>
                      <span className={`cv-pill ${r.verdict.includes('matches') ? 'is-ok' : r.verdict.includes('not part') || r.verdict.includes('invalid') ? 'is-err' : ''}`}>
                        {r.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* FOOTER STATS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="contributors" value={String(status?.contributors.length ?? 0)} suffix="attested" />
          <FooterStat label="final hash" value={status?.finalZkeySha256?.slice(0, 8) ?? '—'} suffix={status?.finalZkeySha256 ? '…' : 'pending'} mono yellow />
          <FooterStat label="lookups" value={String(recent.length)} suffix="this session" />
          <FooterStat label="local" value="this tab" suffix="no server" blue />
        </section>

      </div>
    </main>
  );
}

function ResultCard({ result, query }: { result: AttestationResult; query: string }) {
  if (result.kind === 'idle') {
    return (
      <div className="cv-card is-paper" style={{ minHeight: 240, display: 'flex', flexDirection: 'column' }}>
        <div className="cv-cardhead">
          <span className="dot" /><span>RESULT · idle</span>
        </div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24, color: 'var(--cv-mute)' }}>
          <div>
            <div style={{ fontFamily: 'var(--cv-display)', fontSize: 64, color: 'var(--cv-ua-blue)', lineHeight: 1 }}>·</div>
            <div style={{ fontSize: 13, marginTop: 12 }}>
              No query yet. Paste a 64-hex SHA-256 above and press <b>▶ Verify</b>.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (result.kind === 'invalid') {
    return (
      <div className="cv-card is-yellow">
        <div className="cv-cardhead">
          <span>RESULT · invalid</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-err">REJECTED</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>
          <b>"{query.slice(0, 40)}{query.length > 40 ? '…' : ''}"</b> is not a 64-hex SHA-256 hash.
          A ceremony attestation looks like <code style={{ fontFamily: 'var(--cv-mono)' }}>0x9f81…</code> with exactly 64 hex characters after the <code>0x</code>.
        </div>
      </div>
    );
  }
  if (result.kind === 'feed-down') {
    return (
      <div className="cv-card" style={{ background: 'var(--cv-err)' }}>
        <div className="cv-cardhead">
          <span>RESULT · feed unreachable</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-err">FEED DOWN</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          We can't reach the ceremony status feed right now. Your hash is well-formed —
          we just can't compare it against the chain until the feed comes back.
        </div>
      </div>
    );
  }
  if (result.kind === 'matches-final') {
    return (
      <div className="cv-card is-blue" style={{ padding: '20px 24px' }}>
        <div className="cv-cardhead" style={{ color: '#fff' }}>
          <span className="dot live" />
          <span>RESULT · matches published FINAL zkey</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-ok">VERIFIED · ✓</span>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '8px 0' }}>
          <div className="cv-num" style={{ color: 'var(--cv-ua-yellow)', fontSize: 72 }}>✓</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            <b style={{ color: 'var(--cv-ua-yellow)' }}>This hash is the final zkey.</b>
            <br />
            Whoever you got the file from delivered the byte-identical artifact that the verifier
            will be deployed with. Cryptographic provenance confirmed.
          </div>
        </div>
      </div>
    );
  }
  if (result.kind === 'matches-contributor') {
    return (
      <div className="cv-card is-blue" style={{ padding: '20px 24px' }}>
        <div className="cv-cardhead" style={{ color: '#fff' }}>
          <span className="dot live" />
          <span>RESULT · attested by a contributor</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-ok">CHAIN · ✓</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 14, fontSize: 13.5 }}>
          <Field label="round">#{String(result.round).padStart(3, '0')}</Field>
          <Field label="contributor">{result.contributorName}</Field>
          <Field label="hash"><span style={{ wordBreak: 'break-all' }}>{result.hash}</span></Field>
        </div>
        <div className="cv-hatch" style={{ margin: '14px -24px', borderColor: 'var(--cv-ua-yellow)' }} />
        <div style={{ fontSize: 12.5, opacity: .9, lineHeight: 1.55 }}>
          This is a per-round intermediate — one link in the chain. The final zkey is computed
          by chaining all rounds + the public-randomness beacon.
        </div>
      </div>
    );
  }
  // unknown
  return (
    <div className="cv-card is-paper">
      <div className="cv-cardhead">
        <span>RESULT · not part of this ceremony</span>
        <span style={{ flex: 1 }} />
        <span className="cv-pill is-err">UNKNOWN</span>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '8px 0' }}>
        <div className="cv-num" style={{ color: 'var(--cv-ua-blue)', fontSize: 72 }}>∅</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          <b>{result.hash?.slice(0, 18)}…{result.hash?.slice(-6)}</b> isn't in the published
          chain. It's not a contributor attestation, and it's not the final zkey.
          <br /><br />
          <span style={{ color: 'var(--cv-mute)' }}>
            This is the truth from the chain — not "we couldn't reach it." If you expected
            a match, double-check the hash and check that you're looking at the right
            ceremony (zkqes Phase 2 trusted-setup).
          </span>
        </div>
      </div>
    </div>
  );
}

function ExplainerCard() {
  return (
    <div className="cv-card is-yellow">
      <div className="cv-cardhead">
        <span>WHAT THIS VERIFIES</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.55 }}>
        {[
          ['matches FINAL', 'the hash is identical to the published final zkey — what the verifier deploys with'],
          ['matches CONTRIBUTOR', 'the hash is one of the per-round intermediate attestations'],
          ['not part of this ceremony', 'the hash is well-formed but never appeared in this chain'],
        ].map(([k, v]) => (
          <li key={k} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'baseline' }}>
            <span className="cv-pill is-blue" style={{ whiteSpace: 'nowrap' }}>{k}</span>
            <span>{v}</span>
          </li>
        ))}
      </ul>
      <div className="cv-hatch" style={{ margin: '14px -16px' }} />
      <div style={{ fontSize: 11.5, color: 'var(--cv-mute)' }}>
        Verification is local — no server hit. The chain is fetched from the public status feed once.
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/ceremony" style={{
      fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-ua-blue)',
      textDecoration: 'underline', textUnderlineOffset: 3,
    }}>
      ← back to ceremony overview
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ color: 'var(--cv-ua-yellow)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 10.5 }}>{label}</span>
      <span style={{ fontFamily: 'var(--cv-mono)' }}>{children}</span>
    </>
  );
}

function FooterStat({ label, value, suffix, yellow, blue, mono }: {
  label: string; value: string; suffix?: string; yellow?: boolean; blue?: boolean; mono?: boolean;
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
