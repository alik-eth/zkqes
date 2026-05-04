// Single source of truth for surface-level phase reads.
//
// Per docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 1
// + spec §7.2: poll status.json every 30 s, parse with the existing
// `parseStatusPayload` (which already derives `phase` for legacy payloads),
// and expose {phase, status, error, isLoading} for Landing, /ceremony,
// PreviewModeBanner et al.
//
// Hooks in this app keep their fetch logic local rather than going through
// React Query — bundle-size matters for the static-tarball deploy target,
// and the polling shape here is a single ~120-byte JSON every 30 s.

import { useEffect, useState } from 'react';
import {
  CEREMONY_POLL_MS,
  CEREMONY_STATUS_URL,
  parseStatusPayload,
  type CeremonyPhase,
  type CeremonyStatusPayload,
} from '../lib/ceremonyStatus';

export interface UseCeremonyPhaseResult {
  /** Phase from the most recent successful parse, or `null` while loading / on error. */
  readonly phase: CeremonyPhase | null;
  /** Last-known full payload, or `null` while loading / on error. */
  readonly status: CeremonyStatusPayload | null;
  /** Human-readable error message from the last failed fetch / parse, or `null` when healthy. */
  readonly error: string | null;
  /** True until the first fetch resolves (success or failure). */
  readonly isLoading: boolean;
}

const INITIAL_STATE: UseCeremonyPhaseResult = {
  phase: null,
  status: null,
  error: null,
  isLoading: true,
};

/**
 * Polls the ceremony status feed and exposes the current `phase` discriminator.
 *
 * - URL comes from `CEREMONY_STATUS_URL` (overrideable via
 *   `VITE_CEREMONY_STATUS_URL` for local dev / Playwright fixtures).
 * - Polling cadence is `CEREMONY_POLL_MS` (30 s per founder dispatch).
 * - Network and parse errors land in `error`; on failure `phase` and `status`
 *   reset to `null` so consumers can render the recruiting fallback per
 *   spec §4.5.
 * - On unmount the in-flight fetch is ignored (no setState after unmount) and
 *   the polling interval is cleared.
 */
export function useCeremonyPhase(): UseCeremonyPhaseResult {
  const [state, setState] = useState<UseCeremonyPhaseResult>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus(): Promise<void> {
      try {
        const sep = CEREMONY_STATUS_URL.includes('?') ? '&' : '?';
        const res = await fetch(`${CEREMONY_STATUS_URL}${sep}t=${Date.now()}`, {
          cache: 'no-cache',
        });
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const raw = (await res.json()) as unknown;
        const status = parseStatusPayload(raw);
        if (cancelled) return;
        setState({ phase: status.phase, status, error: null, isLoading: false });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'unknown error';
        setState({ phase: null, status: null, error: msg, isLoading: false });
      }
    }

    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, CEREMONY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
