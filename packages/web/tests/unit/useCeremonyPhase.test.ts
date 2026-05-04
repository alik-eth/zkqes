// Test for `useCeremonyPhase` — single source of phase reads consumed by
// Landing, /ceremony, and the app-route preview banner per
// docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 1.
//
// Tests live under packages/web/tests/unit/ to match the project's vitest
// `include: ['tests/unit/**/*.test.{ts,tsx}']` config — the per-worker plan's
// adjacent-test path (`src/hooks/...test.ts`) would not be picked up.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCeremonyPhase } from '../../src/hooks/useCeremonyPhase';

const recruitingPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('useCeremonyPhase', () => {
  // NOTE: deliberate departure from the per-worker plan's `vi.useFakeTimers()`
  // pre-amble. Fake timers freeze `setTimeout`, which is what `waitFor` uses
  // internally — under fake timers without `shouldAdvanceTime`, every async
  // assertion times out at 5 s. The poll cadence (`CEREMONY_POLL_MS`) is not
  // covered by these tests; the initial-fetch and parse contracts are. The
  // real-timer setup is what the rest of the web suite uses for hooks
  // (see `tests/unit/CliBanner.test.tsx`).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns isLoading=true on first render', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(recruitingPayload)),
    );
    const { result } = renderHook(() => useCeremonyPhase());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.phase).toBe(null);
  });

  it('parses a valid recruiting payload and exposes phase=recruiting', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(recruitingPayload)),
    );
    const { result } = renderHook(() => useCeremonyPhase());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.phase).toBe('recruiting');
    expect(result.current.status?.totalRounds).toBe(10);
    expect(result.current.error).toBe(null);
  });

  it('falls back to phase=null + error on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useCeremonyPhase());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.phase).toBe(null);
    expect(result.current.error).toMatch(/network/);
  });

  it('falls back to phase=null + error on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 }),
    );
    const { result } = renderHook(() => useCeremonyPhase());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.phase).toBe(null);
    expect(result.current.error).toMatch(/404/);
  });

  it('derives phase from legacy payload (no phase field)', async () => {
    const { phase: _omit, ...legacy } = recruitingPayload;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(legacy)),
    );
    const { result } = renderHook(() => useCeremonyPhase());
    await waitFor(() => expect(result.current.phase).toBe('recruiting'));
    expect(result.current.error).toBe(null);
  });
});
