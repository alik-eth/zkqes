// VerifyShell — /verify 3-col civic-terminal inspector.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 11.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §5.3.
//
// Two-tab inspector composition (per spec §5.3):
//
//   left   — "WHAT THIS VERIFIES" explainer panel.
//   middle — tab pair (`by attestation` / `by wallet`) + input + result panel.
//            Result rendered as a labeled-row <dl> per the civic-document
//            tone. Recent lookups persisted to localStorage so the user
//            can scroll back through their session.
//   right  — "RECENT" log panel reading the last 10 lookups.
//
// Tab semantics:
//   by attestation — paste a SHA-256 hash; look up in
//                    `status.contributors[].attestation` (membership +
//                    ordering) AND against `status.finalZkeySha256`. This
//                    is the union of the v1 PasteAttestation widget on
//                    /ceremony + the legacy verify.tsx zkey-hash check.
//   by wallet      — paste a wallet address; intended to look up the
//                    registered binding on-chain. PRE-PUMP gate per
//                    lead's "don't add new on-chain reads": shows a
//                    polite "available after Sepolia acceptance" stub
//                    with the FROZEN tooltip pattern. Wires to the
//                    real registry-read helper post-Task-13 atomic flip.
//
// Reuses Marquee + FooterRibbon + PreviewModeBanner from civic-terminal/
// + app/ chrome work (Tasks 2 + 7). Variant-gated at the route level —
// legacy `CeremonyVerify` stays the default until Task 13 atomic flip,
// matching the /ceremony rollout pattern.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Marquee } from '../civic-terminal/Marquee';
import { FooterRibbon } from '../civic-terminal/FooterRibbon';
import { PreviewModeBanner } from '../app/PreviewModeBanner';
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import {
  type CeremonyPhase,
  type CeremonyStatusPayload,
} from '../../lib/ceremonyStatus';

type VerifyTab = 'attestation' | 'wallet';

interface AttestationResult {
  readonly kind:
    | 'idle'
    | 'empty'
    | 'matches-final'
    | 'matches-contributor'
    | 'unknown';
  readonly hash?: string;
  readonly contributorName?: string;
  readonly round?: number;
}

interface WalletResult {
  readonly kind: 'idle' | 'empty' | 'invalid' | 'pre-launch';
  readonly address?: string;
}

interface RecentLookup {
  readonly kind: VerifyTab;
  readonly query: string;
  readonly verdict: string;
  readonly at: string;
}

const RECENT_KEY = 'qkb.demo.verify.recent.v1';
const RECENT_MAX = 10;
const HEX64_RE = /^0x?[0-9a-f]{64}$/i;
const HEX_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

function sidebarTextForVerifyPhase(phase: CeremonyPhase): string {
  if (phase === 'recruiting') return 'inspector · pre-launch';
  if (phase === 'ceremony-live') return 'inspector · ceremony in progress';
  return 'inspector · live registry';
}

function readRecent(): readonly RecentLookup[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentLookup =>
          typeof e === 'object' &&
          e !== null &&
          (e.kind === 'attestation' || e.kind === 'wallet') &&
          typeof e.query === 'string' &&
          typeof e.verdict === 'string' &&
          typeof e.at === 'string',
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentLookup): readonly RecentLookup[] {
  const next = [entry, ...readRecent()].slice(0, RECENT_MAX);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // localStorage may be quota-full or disabled in some browsers
      // (private mode in Safari historically). Recent log is a nice-
      // to-have, not load-bearing; swallow the error.
    }
  }
  return next;
}

function lookupAttestation(
  hash: string,
  status: CeremonyStatusPayload | null,
): AttestationResult {
  const trimmed = hash.trim().toLowerCase();
  if (!trimmed) return { kind: 'empty' };
  // Allow callers to omit the leading 0x.
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!status) {
    return { kind: 'unknown', hash: normalized };
  }
  // Final zkey hash check (the legacy verify.tsx flow's primary purpose).
  if (
    status.finalZkeySha256 &&
    status.finalZkeySha256.toLowerCase().replace(/^0x/, '') ===
      normalized.replace(/^0x/, '')
  ) {
    return { kind: 'matches-final', hash: normalized };
  }
  // Contributor-attestation lookup (mirrors PasteAttestation on /ceremony).
  const match = status.contributors.find(
    (c) =>
      c.attestation?.toLowerCase().replace(/^0x/, '') ===
      normalized.replace(/^0x/, ''),
  );
  if (match) {
    return {
      kind: 'matches-contributor',
      hash: normalized,
      contributorName: match.name,
      round: match.round,
    };
  }
  return { kind: 'unknown', hash: normalized };
}

interface VerifyShellProps {
  /** Test seam: pre-seed the recent-lookups log. */
  readonly initialRecent?: readonly RecentLookup[];
  /**
   * Test seam: skip localStorage reads on initial mount. Useful in unit
   * tests where vitest's jsdom can't be guaranteed to have a clean key.
   */
  readonly skipLocalStorage?: boolean;
}

export function VerifyShell({
  initialRecent,
  skipLocalStorage,
}: VerifyShellProps = {}) {
  const { t } = useTranslation();
  const { phase, status } = useCeremonyPhase();
  const effectivePhase: CeremonyPhase = phase ?? 'recruiting';
  const [tab, setTab] = useState<VerifyTab>('attestation');
  const [hashInput, setHashInput] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [hashResult, setHashResult] = useState<AttestationResult>({
    kind: 'idle',
  });
  const [walletResult, setWalletResult] = useState<WalletResult>({
    kind: 'idle',
  });
  const [recent, setRecent] = useState<readonly RecentLookup[]>(
    initialRecent ?? [],
  );

  useEffect(() => {
    if (skipLocalStorage) return;
    setRecent(readRecent());
  }, [skipLocalStorage]);

  function handleVerifyAttestation(): void {
    const result = lookupAttestation(hashInput, status);
    setHashResult(result);
    if (result.kind === 'empty') return;
    // Verdict line for the RECENT panel. Template literal rather than
    // i18next's options-form interpolation so the rendered text doesn't
    // depend on a configured react-i18next provider — keeps the recent-log
    // assertion deterministic in unit tests AND avoids a "round {{round}}"
    // leak if interpolation silently fails. The localized verdict in the
    // result panel above stays via t().
    const verdict =
      result.kind === 'matches-final'
        ? t('ceremony.verify.v2.verdict.final', 'matches published final zkey')
        : result.kind === 'matches-contributor'
          ? `round ${result.round} · ${result.contributorName}`
          : status === null
            ? t('ceremony.verify.v2.verdict.feedDown', 'status feed unreachable')
            : t('ceremony.verify.v2.verdict.unknown', 'not part of this ceremony');
    const next = pushRecent({
      kind: 'attestation',
      query: hashInput.trim(),
      verdict,
      at: new Date().toISOString(),
    });
    setRecent(next);
  }

  function handleVerifyWallet(): void {
    const trimmed = walletInput.trim();
    if (!trimmed) {
      setWalletResult({ kind: 'empty' });
      return;
    }
    if (!HEX_ADDR_RE.test(trimmed)) {
      setWalletResult({ kind: 'invalid', address: trimmed });
      return;
    }
    // Lead direction: do NOT add new on-chain reads in Task 11. The
    // by-wallet flow is wired to the Sepolia registry helper post-pump
    // (Task 13 atomic flip). For now, surface a polite pre-launch state
    // so the tab is reachable but doesn't claim verification it can't
    // perform.
    setWalletResult({ kind: 'pre-launch', address: trimmed });
    const verdict = t(
      'ceremony.verify.v2.verdict.preLaunch',
      'available after trusted setup ceremony + Base Sepolia testnet deploy',
    );
    const next = pushRecent({
      kind: 'wallet',
      query: trimmed,
      verdict,
      at: new Date().toISOString(),
    });
    setRecent(next);
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
    >
      <Marquee
        phase={effectivePhase}
        round={status?.round ?? 0}
        totalRounds={status?.totalRounds ?? 0}
        sidebarText={sidebarTextForVerifyPhase(effectivePhase)}
      />
      <PreviewModeBanner />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr 260px',
          gap: 'var(--ct-gap)',
          padding: 'var(--ct-pad)',
          flex: 1,
        }}
      >
        <aside
          className="ct-panel"
          style={{
            padding: 'var(--ct-pad)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--ct-fs)',
          }}
        >
          <h3 className="ct-tag">
            {t('ceremony.verify.v2.explainer.heading', 'WHAT THIS VERIFIES')}
          </h3>
          <p>
            {t(
              'ceremony.verify.v2.explainer.body',
              'Looks up an attestation hash against the published ceremony chain, or a wallet against the on-chain registry once Base Sepolia is live.',
            )}
          </p>
        </aside>
        <section
          style={{ display: 'grid', gap: 'var(--ct-gap)' }}
          aria-labelledby="verify-tabs-heading"
        >
          <h2 id="verify-tabs-heading" className="sr-only">
            {t('ceremony.verify.v2.heading', 'Verify')}
          </h2>
          <div role="tablist" aria-label="verify-mode" style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'attestation'}
              className={tab === 'attestation' ? 'ct-tab' : 'ct-tab ct-tab--off'}
              onClick={() => setTab('attestation')}
              data-testid="verify-tab-attestation"
            >
              {t('ceremony.verify.v2.tab.attestation', 'by attestation')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'wallet'}
              className={tab === 'wallet' ? 'ct-tab' : 'ct-tab ct-tab--off'}
              onClick={() => setTab('wallet')}
              data-testid="verify-tab-wallet"
            >
              {t('ceremony.verify.v2.tab.wallet', 'by wallet')}
            </button>
          </div>

          {tab === 'attestation' && (
            <div className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
              <input
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder={t(
                  'ceremony.verify.v2.input.attestation',
                  'paste attestation sha-256 (with or without 0x)',
                )}
                aria-label={t(
                  'ceremony.verify.v2.input.attestation',
                  'paste attestation sha-256 (with or without 0x)',
                )}
                style={{
                  fontFamily: 'var(--mono)',
                  padding: '8px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                data-testid="verify-input-attestation"
              />
              <button
                type="button"
                className="ct-tab"
                onClick={handleVerifyAttestation}
                style={{ marginTop: '8px' }}
                data-testid="verify-submit-attestation"
              >
                {t('ceremony.verify.v2.submit', 'verify')}
              </button>
              {hashResult.kind !== 'idle' && (
                <dl
                  data-testid="verify-result-attestation"
                  style={{
                    marginTop: '12px',
                    fontFamily: 'var(--mono)',
                    fontSize: '12px',
                  }}
                >
                  {hashResult.kind === 'empty' && (
                    <p style={{ color: 'var(--err)' }}>
                      {t('ceremony.verify.v2.result.empty', '✗ empty input')}
                    </p>
                  )}
                  {hashResult.kind === 'unknown' && (
                    <>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.hash', 'hash')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0 }}>{hashResult.hash}</dd>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.verdict', 'verdict')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0, color: 'var(--err)' }}>
                        {status === null
                          ? t(
                              'ceremony.verify.v2.result.feedDown',
                              '✗ status feed unreachable; cannot determine.',
                            )
                          : t(
                              'ceremony.verify.v2.result.unknown',
                              '✗ not part of this ceremony',
                            )}
                      </dd>
                    </>
                  )}
                  {hashResult.kind === 'matches-final' && (
                    <>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.verdict', 'verdict')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0, color: 'var(--ok)' }}>
                        {t(
                          'ceremony.verify.v2.result.final',
                          '✓ matches published final zkey',
                        )}
                      </dd>
                    </>
                  )}
                  {hashResult.kind === 'matches-contributor' && (
                    <>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.round', 'round')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0 }}>{hashResult.round}</dd>
                      <dt>
                        <strong>
                          {t(
                            'ceremony.verify.v2.result.label.contributor',
                            'contributor',
                          )}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0 }}>
                        {hashResult.contributorName}
                      </dd>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.verdict', 'verdict')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0, color: 'var(--ok)' }}>
                        {t(
                          'ceremony.verify.v2.result.contributor',
                          '✓ matches a published attestation',
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              )}
              {hashInput && !HEX64_RE.test(hashInput.trim()) && (
                <p
                  style={{
                    marginTop: '6px',
                    color: 'var(--ct-mute)',
                    fontSize: '11px',
                  }}
                >
                  {t(
                    'ceremony.verify.v2.input.format',
                    'expected: 64 hex chars (sha-256), with or without 0x prefix',
                  )}
                </p>
              )}
            </div>
          )}

          {tab === 'wallet' && (
            <div className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
              <input
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder={t(
                  'ceremony.verify.v2.input.wallet',
                  'paste wallet address 0x…',
                )}
                aria-label={t(
                  'ceremony.verify.v2.input.wallet',
                  'paste wallet address 0x…',
                )}
                style={{
                  fontFamily: 'var(--mono)',
                  padding: '8px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                data-testid="verify-input-wallet"
              />
              <button
                type="button"
                className="ct-tab"
                onClick={handleVerifyWallet}
                style={{ marginTop: '8px' }}
                data-testid="verify-submit-wallet"
              >
                {t('ceremony.verify.v2.submit', 'verify')}
              </button>
              {walletResult.kind !== 'idle' && (
                <dl
                  data-testid="verify-result-wallet"
                  style={{
                    marginTop: '12px',
                    fontFamily: 'var(--mono)',
                    fontSize: '12px',
                  }}
                >
                  {walletResult.kind === 'empty' && (
                    <p style={{ color: 'var(--err)' }}>
                      {t('ceremony.verify.v2.result.empty', '✗ empty input')}
                    </p>
                  )}
                  {walletResult.kind === 'invalid' && (
                    <>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.verdict', 'verdict')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0, color: 'var(--err)' }}>
                        {t(
                          'ceremony.verify.v2.result.invalidAddress',
                          '✗ not a valid 0x-prefixed wallet address',
                        )}
                      </dd>
                    </>
                  )}
                  {walletResult.kind === 'pre-launch' && (
                    <>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.address', 'address')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0 }}>{walletResult.address}</dd>
                      <dt>
                        <strong>
                          {t('ceremony.verify.v2.result.label.verdict', 'verdict')}
                        </strong>
                      </dt>
                      <dd style={{ marginLeft: 0, color: 'var(--warn)' }}>
                        {t(
                          'ceremony.verify.v2.result.preLaunch',
                          '◐ available after trusted setup ceremony + Base Sepolia testnet deploy',
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          )}
        </section>
        <aside
          className="ct-panel"
          style={{
            padding: 'var(--ct-pad)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--ct-fs)',
          }}
        >
          <h3 className="ct-tag">
            {t('ceremony.verify.v2.recent.heading', 'RECENT')}
          </h3>
          {recent.length === 0 ? (
            <p style={{ color: 'var(--ct-mute)', fontSize: '11px' }}>
              {t('ceremony.verify.v2.recent.empty', 'no lookups yet')}
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
              data-testid="verify-recent-list"
            >
              {recent.map((r) => (
                <li
                  key={r.at}
                  style={{
                    fontSize: '11px',
                    borderTop: '1px solid var(--ct-rule-soft)',
                    paddingTop: '4px',
                  }}
                >
                  <strong>{r.kind}</strong> ·{' '}
                  {r.query.length > 18 ? `${r.query.slice(0, 18)}…` : r.query}
                  <div style={{ color: 'var(--ct-mute)' }}>{r.verdict}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
