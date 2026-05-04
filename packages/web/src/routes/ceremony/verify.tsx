// V5.2 Phase B ceremony — verify-post-ceremony page.
//
// Public sanity check: drop the downloaded zkey (`qkb-v5_2-stub.zkey`
// pre-Phase-B; `qkb-v5_2-final.zkey` post-ceremony — the aria branches
// on `status.finalZkeySha256!==null` since that's the field that drives
// "stub" vs "ceremony complete" UI states from V5.1). The browser
// computes sha256 in a Web Worker (bounded peak heap via streaming),
// and compares against the published `finalZkeySha256` in status.json.
// ✓ if match, ✗ if not.
//
// Civic-terminal v2 variant (gated behind `?variant=civic-terminal`):
// the 3-col `<VerifyShell>` per spec §5.3 + plan Task 11. Same variant-
// gate strategy as /ceremony — legacy body stays default until Task 13's
// atomic flip, preserving existing Playwright e2e during dev.
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentFooter } from '../../components/DocumentFooter';
import { PaperGrain } from '../../components/PaperGrain';
import { VerifyShell } from '../../components/ceremony/VerifyShell';
import {
  CEREMONY_STATUS_URL,
  fetchCeremonyStatus,
} from '../../lib/ceremonyStatus';

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'hashing'; pct: number; fileName: string }
  | { kind: 'matched'; sha256Hex: string; fileName: string }
  | { kind: 'mismatch'; sha256Hex: string; expected: string; fileName: string }
  | { kind: 'no-published-hash'; sha256Hex: string; fileName: string }
  | { kind: 'error'; message: string };

/**
 * Tri-state for the upload-input's aria copy. Distinct from
 * `expectedHash !== null` because the status-feed fetch can return
 * `null` for two distinct reasons:
 *   - genuine "ceremony incomplete, stub state" (we want stub filename)
 *   - transient network failure / loading (we want NEUTRAL copy because
 *     we don't yet know whether the published artefact is stub or final)
 *
 * The status page (`status.tsx`) already models this distinction via
 * `loading | unavailable | ok` — verify.tsx adopts the same posture so
 * a transient fetch failure post-Phase-B doesn't tell screen-reader
 * users to upload `qkb-v5_2-stub.zkey` when the live artefact is
 * actually `-final.zkey`.
 */
// Four-way phase per task #53 — splits the prior 3-way (which lumped
// fetch-failure with "still loading"). The published-hash section's
// sighted-user copy now distinguishes:
//   loading      — fetch still in flight (just-mounted)
//   feed-failed  — fetch returned null OR threw; status feed unreachable
//                  (R2 outage, transient network); user shouldn't read
//                  this as "ceremony not started"
//   stub         — fetch succeeded + finalZkeySha256 null (genuine pre-
//                  Phase-B state)
//   final        — fetch succeeded + finalZkeySha256 set
//
// Pre-#53, both `loading` and the network-failed case rendered the
// same "Ceremony not yet complete" copy via the binary
// `expectedHash === null` check at line ~177. That conflated the two
// states for sighted users — confusing during R2 outages mid-ceremony.
type AriaPhase = 'loading' | 'feed-failed' | 'stub' | 'final';

export function CeremonyVerify() {
  // Civic-terminal v2 prototype gate. Same runtime URL-search pattern used
  // by the home variant in `routes/index.tsx` and the /ceremony route. The
  // legacy body is extracted into `LegacyCeremonyVerify` so `useTranslation`
  // (and the worker effects below) aren't called conditionally.
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('variant') ===
      'civic-terminal'
  ) {
    return <VerifyShell />;
  }
  return <LegacyCeremonyVerify />;
}

function LegacyCeremonyVerify() {
  const { t } = useTranslation();
  const [expectedHash, setExpectedHash] = useState<string | null>(null);
  const [ariaPhase, setAriaPhase] = useState<AriaPhase>('loading');
  const [state, setState] = useState<VerifyState>({ kind: 'idle' });
  const workerRef = useRef<Worker | null>(null);

  // Pull the published final hash from status.json. Four terminal
  // states (see `AriaPhase` doc-comment above for the rationale):
  //   - fetch threw / returned null               → 'feed-failed'
  //   - fetch succeeded + finalZkeySha256 null    → 'stub'
  //   - fetch succeeded + finalZkeySha256 present → 'final'
  // Initial state (pre-resolution)                → 'loading'
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    void fetchCeremonyStatus(CEREMONY_STATUS_URL, ac.signal).then((p) => {
      if (cancelled) return;
      if (p === null) {
        // fetchCeremonyStatus returns null for both "incomplete" and
        // "network/parse error" — but the helper's `try { ... } catch
        // { return null; }` swallows the cause. Map both to
        // 'feed-failed' so the user sees a "feed unreachable; retry"
        // message rather than the conflated "ceremony not yet
        // complete" copy.
        setAriaPhase('feed-failed');
        return;
      }
      setExpectedHash(p.finalZkeySha256 ?? null);
      setAriaPhase(p.finalZkeySha256 ? 'final' : 'stub');
    });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    workerRef.current?.terminate();
    setState({ kind: 'hashing', pct: 0, fileName: file.name });

    const worker = new Worker(
      new URL('../../workers/zkey-hash.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;
    worker.addEventListener('message', (ev: MessageEvent<unknown>) => {
      const msg = ev.data as
        | { kind: 'progress'; id: number; pct: number }
        | { kind: 'result'; id: number; sha256Hex: string }
        | { kind: 'error'; id: number; message: string };
      if (msg.kind === 'progress') {
        setState((cur) =>
          cur.kind === 'hashing' ? { ...cur, pct: msg.pct } : cur,
        );
      } else if (msg.kind === 'result') {
        worker.terminate();
        workerRef.current = null;
        if (expectedHash === null) {
          setState({
            kind: 'no-published-hash',
            sha256Hex: msg.sha256Hex,
            fileName: file.name,
          });
        } else if (msg.sha256Hex.toLowerCase() === expectedHash.toLowerCase()) {
          setState({
            kind: 'matched',
            sha256Hex: msg.sha256Hex,
            fileName: file.name,
          });
        } else {
          setState({
            kind: 'mismatch',
            sha256Hex: msg.sha256Hex,
            expected: expectedHash,
            fileName: file.name,
          });
        }
      } else {
        worker.terminate();
        workerRef.current = null;
        setState({ kind: 'error', message: msg.message });
      }
    });
    worker.postMessage({ kind: 'hash', id: 1, file });
  };

  return (
    <main className="relative min-h-screen">
      <PaperGrain />
      <div className="doc-grid pt-24 relative z-10">
        <div />
        <div className="min-w-0 max-w-3xl space-y-12">
          <Link to="/ceremony" className="text-mono text-xs block">
            ← {t('ceremony.verify.back', 'back to overview')}
          </Link>

          <header>
            <h1
              className="text-4xl sm:text-5xl leading-none mb-8"
              style={{ color: 'var(--ink)' }}
            >
              {t('ceremony.verify.heading', 'Verify your zkey.')}
            </h1>
            <p className="text-base max-w-prose" style={{ color: 'var(--ink)' }}>
              {t(
                'ceremony.verify.lede',
                'Drop the prover key file you downloaded. The browser computes a SHA-256 of every byte and compares against the hash committed in the on-chain verifier contract — published below once the ceremony is complete.',
              )}
            </p>
          </header>

          <hr className="rule" />

          <section
            aria-labelledby="published-heading"
            data-testid="ceremony-verify-published"
            className="space-y-3"
          >
            <h2
              id="published-heading"
              className="text-3xl"
              style={{ color: 'var(--ink)' }}
            >
              {t('ceremony.verify.publishedHeading', 'Published final hash')}
            </h2>
            {/*
              * Sighted-user copy parity with the aria tri-state per task
              * #53. Four branches now — `loading` for in-flight,
              * `feed-failed` for R2 / network outages (so contributors
              * don't read a transient outage as "ceremony not started"),
              * `stub` for the genuine pre-final state, `final` for the
              * published hash.
              */}
            {ariaPhase === 'loading' && (
              <p
                className="text-base"
                style={{ color: 'var(--ink)', opacity: 0.7 }}
                data-testid="ceremony-verify-loading"
              >
                {t(
                  'ceremony.verify.published.loading',
                  'Loading ceremony status…',
                )}
              </p>
            )}
            {ariaPhase === 'feed-failed' && (
              <p
                className="text-base"
                style={{ color: 'var(--ink)', opacity: 0.7 }}
                data-testid="ceremony-verify-feed-failed"
              >
                {t(
                  'ceremony.verify.published.feedFailed',
                  'Could not reach the ceremony status feed. The published hash will appear here once the feed is reachable; refresh the page to retry.',
                )}
              </p>
            )}
            {ariaPhase === 'stub' && (
              <p
                className="text-base"
                style={{ color: 'var(--ink)', opacity: 0.7 }}
                data-testid="ceremony-verify-pending"
              >
                {t(
                  'ceremony.verify.published.pending',
                  'Ceremony is not yet complete. The final zkey hash is published here once the last contributor uploads and the public-randomness beacon is mixed in.',
                )}
              </p>
            )}
            {ariaPhase === 'final' && expectedHash !== null && (
              <p
                className="text-mono text-sm break-all"
                data-testid="ceremony-verify-expected"
                style={{ color: 'var(--ink)' }}
              >
                sha256 {expectedHash}
              </p>
            )}
          </section>

          <hr className="rule" />

          <section
            aria-labelledby="upload-heading"
            data-testid="ceremony-verify-upload"
            className="space-y-3"
          >
            <h2
              id="upload-heading"
              className="text-3xl"
              style={{ color: 'var(--ink)' }}
            >
              {t('ceremony.verify.uploadHeading', 'Hash your downloaded zkey')}
            </h2>
            <input
              type="file"
              accept=".zkey,application/octet-stream"
              aria-label={
                ariaPhase === 'final'
                  ? t(
                      'ceremony.verify.fileAriaFinal',
                      'Upload your downloaded qkb-v5_2-final.zkey',
                    )
                  : ariaPhase === 'stub'
                    ? t(
                        'ceremony.verify.fileAriaStub',
                        'Upload your downloaded qkb-v5_2-stub.zkey',
                      )
                    : t(
                        'ceremony.verify.fileAriaNeutral',
                        'Upload your downloaded zkey',
                      )
              }
              data-testid="ceremony-verify-file"
              onChange={onFile}
              disabled={state.kind === 'hashing'}
            />
          </section>

          {state.kind === 'hashing' && (
            <p
              className="text-mono text-sm"
              role="status"
              data-testid="ceremony-verify-progress"
              style={{ color: 'var(--ink)' }}
            >
              {t('ceremony.verify.progress', 'Hashing')} {state.fileName}…{' '}
              {state.pct}%
            </p>
          )}

          {state.kind === 'matched' && (
            <p
              className="text-base"
              role="status"
              data-testid="ceremony-verify-matched"
              style={{ color: 'var(--olive)' }}
            >
              ✓{' '}
              {t(
                'ceremony.verify.matched',
                'Match. This file is the same prover key the verifier contract was deployed with.',
              )}
            </p>
          )}

          {state.kind === 'mismatch' && (
            <div className="space-y-2">
              <p
                className="text-base"
                role="alert"
                data-testid="ceremony-verify-mismatch"
                style={{ color: 'var(--brick)' }}
              >
                ✗{' '}
                {t(
                  'ceremony.verify.mismatch',
                  'No match. Do not use this file. Re-download from the canonical source.',
                )}
              </p>
              <p className="text-mono text-xs break-all" style={{ color: 'var(--ink)' }}>
                got      sha256 {state.sha256Hex}
              </p>
              <p className="text-mono text-xs break-all" style={{ color: 'var(--ink)' }}>
                expected sha256 {state.expected}
              </p>
            </div>
          )}

          {state.kind === 'no-published-hash' && (
            <p
              className="text-mono text-sm break-all"
              role="status"
              data-testid="ceremony-verify-no-published"
              style={{ color: 'var(--ink)' }}
            >
              {t('ceremony.verify.noPublished', 'Computed')} sha256 {state.sha256Hex}
            </p>
          )}

          {state.kind === 'error' && (
            <p
              className="text-base"
              role="alert"
              data-testid="ceremony-verify-error"
              style={{ color: 'var(--brick)' }}
            >
              {state.message}
            </p>
          )}
        </div>
      </div>
      <DocumentFooter />
    </main>
  );
}
