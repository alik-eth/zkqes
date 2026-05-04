# Civic-terminal v2 — web-eng worker plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read [orchestration plan §2 + §6](2026-05-04-zkqes-civic-terminal-v2-orchestration.md#2-interface-contracts-frozen--do-not-drift-without-lead-broadcast) and the [v2 spec](../specs/2026-05-04-zkqes-civic-terminal-v2-design.md) before starting Task 1.

**Goal:** Implement the v2 civic-terminal surface family — phase-driven Landing, JSON-driven `/ceremony` 3-col shell, app-route refactor (DeviceReadinessGate + PreviewModeBanner + single-long-form `/register` and `/rotate` + 3-col `/verify`), plus a docs.zkqes.org VitePress retheme.

**Architecture:** All surfaces share chrome (`Marquee` + `FooterRibbon`) + token grammar (`packages/web/src/styles/civic-terminal.css`). Body shapes split per surface: 3-col shell on Landing/`/ceremony`/`/verify`; single-long-form on `/register`/`/rotate`. State machine driven by `status.json.phase` read once via a `useCeremonyPhase` hook; components select their content variant from the phase. Token grammar is FROZEN — use existing `.ct-*` primitives only.

**Tech Stack:** TanStack Router, React 19, Tailwind v4, vitest, Playwright, civic-terminal.css.

**Branch baseline:** `feat/v2-web-civic-terminal` off `main` in worktree `/data/Develop/qkb-wt-v5/web`.

**Tasks here:** 13 — W0 (token sanity + frozen-copy harness), W1 (phase hook + status fetch), W2 (shared chrome — Marquee + FooterRibbon), W3 (Landing state-machine wiring), W4 (`/ceremony` left column), W5 (`/ceremony` middle column), W6 (`/ceremony` right column), W7 (PreviewModeBanner), W8 (DeviceReadinessGate), W9 (`/register` single-long-form), W10 (`/account/rotate` wiring), W11 (`/verify` 3-col), W12 (docs retheme), W13 (Playwright phase-rendering e2e).

---

## 0. Frozen reference

### 0.1 Marketer-locked copy (DO NOT REPHRASE)

| Surface           | Element                          | Copy                                                                                                                          |
|-------------------|----------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| Landing           | Binding-statement preview        | "Holders sign a binding statement that names a wallet, and prove the signature in zk — without disclosing it."               |
| Landing           | Marquee count, recruiting        | `round 0 of {TOTAL}` — or `round — of —` if `totalRounds === 0`                                                              |
| Landing           | Disabled-tab tooltip             | `Available after trusted setup ceremony + Base Sepolia testnet deploy`                                                            |
| Landing           | Marquee right sidebar, recruiting| `awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)`                                                    |
| `/ceremony`       | Coord attribution                | `COORD: alik.eth · DM for round assignment`                                                                                  |
| `/ceremony`       | Path card LOCAL                  | `≥32 GB RAM · ~20 min · $0`                                                                                                  |
| `/ceremony`       | Path card CLOUD                  | `Fly.io · ~20 min · ~$0.30`                                                                                                  |
| `/ceremony`       | Path card HETZNER                | `CCX33 · self-driven · see README`                                                                                           |
| App routes        | PreviewModeBanner copy           | `PREVIEW MODE — ceremony in progress · verifications use stub verifier · proofs are NOT trusted for production`              |

For surface copy that is NOT in this table, you have authorial freedom — but i18n parity (en + uk) is a hard rule (`tests/unit/i18n.parity.test.ts` already enforces this).

### 0.2 Frozen civic-terminal primitives (already in `packages/web/src/styles/civic-terminal.css`)

`.ct-panel`, `.ct-panel--raised`, `.ct-panel--inset`, `.ct-tab`, `.ct-tab--off`, `.ct-tag`, `.ct-tag--warn`, `.ct-civic-stripe`, `var(--display)` (VT323), `var(--mono)` (Plex Mono), `var(--ct-paper)`, `var(--ct-ink)`, `var(--ua-blue)`, `var(--ua-yellow)`, `var(--eu-blue)`, `var(--eu-gold)`, `var(--ok)`, `var(--warn)`, `var(--err)`. New primitives = lead broadcast required; do NOT add a one-off CSS class.

---

## File map

| File                                                                  | Action  | Used by              |
|-----------------------------------------------------------------------|---------|----------------------|
| `packages/web/src/lib/ceremonyStatus.ts`                              | Modify  | already done by lead |
| `packages/web/src/hooks/useCeremonyPhase.ts`                          | Create  | landing, /ceremony, app banners |
| `packages/web/src/components/civic-terminal/Marquee.tsx`              | Create  | landing, /ceremony   |
| `packages/web/src/components/civic-terminal/FooterRibbon.tsx`         | Create  | every surface         |
| `packages/web/src/components/CivicTerminalLanding.tsx`                | Modify  | landing               |
| `packages/web/src/components/ceremony/CeremonyShell.tsx`              | Create  | /ceremony             |
| `packages/web/src/components/ceremony/PathCards.tsx`                  | Create  | /ceremony left        |
| `packages/web/src/components/ceremony/RoundChain.tsx`                 | Create  | /ceremony middle      |
| `packages/web/src/components/ceremony/PasteAttestation.tsx`           | Create  | /ceremony right       |
| `packages/web/src/components/ceremony/TrustBudget.tsx`                | Create  | /ceremony right       |
| `packages/web/src/components/ceremony/CeremonyFaq.tsx`                | Create  | /ceremony right       |
| `packages/web/src/routes/ceremony/index.tsx`                          | Modify  | /ceremony             |
| `packages/web/src/components/app/PreviewModeBanner.tsx`               | Create  | /register, /rotate, /verify |
| `packages/web/src/components/app/DeviceReadinessGate.tsx`             | Create  | /register, /rotate    |
| `packages/web/src/lib/deviceGate.ts`                                  | Modify  | DeviceReadinessGate   |
| `packages/web/src/routes/ua/registerV5.tsx`                           | Modify  | /register             |
| `packages/web/src/components/ua/v5/RotateWalletFlow.tsx`              | Modify  | /account/rotate       |
| `packages/web/src/routes/ceremony/verify.tsx`                         | Modify  | /verify (rebuilt)     |
| `packages/web/src/i18n/en.json`, `uk.json`                            | Modify  | all new copy          |
| `docs/.vitepress/theme/custom.css`                                    | Modify  | docs.zkqes.org        |
| `packages/web/tests/e2e/v2-phase-rendering.spec.ts`                   | Create  | Playwright smoke      |

---

## Task 0 — Sync ceremony-status mirror + sanity check

**Files:**
- Read: `packages/web/src/lib/ceremonyStatus.ts` (lead-modified — confirm)

- [ ] **Step 1: Confirm lead's L1+L2 schema bump landed**

```bash
cd /data/Develop/qkb-wt-v5/web
git fetch origin && git rebase origin/main
grep -n "phase" packages/web/src/lib/ceremonyStatus.ts | head -5
```

Expected: `CeremonyPhase` type exported, `phase` in `CeremonyStatusPayload`, `parseStatusPayload` exported. If missing, lead's L1+L2 hasn't landed yet — message lead and pause.

- [ ] **Step 2: Run baseline tests**

```bash
pnpm -F @zkqes/web test
pnpm -F @zkqes/web typecheck
```

Expected: 340+/340+ tests passing, typecheck green. Establish your baseline before adding code.

---

## Task 1 — `useCeremonyPhase` hook + status fetch

**Files:**
- Create: `packages/web/src/hooks/useCeremonyPhase.ts`
- Create: `packages/web/src/hooks/useCeremonyPhase.test.ts`

The single source of truth for surface-level phase reads. Polls `prove.zkqes.org/ceremony/status.json` every 30 s (per spec §7.2), parses with `parseStatusPayload`, returns `{phase, status, error, isLoading}`. Surfaces consume this.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/web/src/hooks/useCeremonyPhase.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCeremonyPhase } from './useCeremonyPhase';

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
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('returns isLoading=true on first render', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(recruitingPayload)));
    const { result } = renderHook(() => useCeremonyPhase());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.phase).toBe(null);
  });

  it('parses a valid recruiting payload and exposes phase=recruiting', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(recruitingPayload)));
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

  it('derives phase from legacy payload (no phase field)', async () => {
    const { phase: _omit, ...legacy } = recruitingPayload;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(legacy)));
    const { result } = renderHook(() => useCeremonyPhase());
    await waitFor(() => expect(result.current.phase).toBe('recruiting'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @zkqes/web exec vitest run src/hooks/useCeremonyPhase.test.ts
```

Expected: FAIL — `useCeremonyPhase` not exported.

- [ ] **Step 3: Implement the hook**

```typescript
// packages/web/src/hooks/useCeremonyPhase.ts
import { useEffect, useState } from 'react';
import {
  type CeremonyPhase,
  type CeremonyStatusPayload,
  parseStatusPayload,
} from '../lib/ceremonyStatus';

const STATUS_URL = 'https://prove.zkqes.org/ceremony/status.json';
const POLL_INTERVAL_MS = 30_000;

export interface UseCeremonyPhaseResult {
  phase: CeremonyPhase | null;
  status: CeremonyStatusPayload | null;
  error: string | null;
  isLoading: boolean;
}

export function useCeremonyPhase(): UseCeremonyPhaseResult {
  const [state, setState] = useState<UseCeremonyPhaseResult>({
    phase: null,
    status: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus(): Promise<void> {
      try {
        const res = await fetch(STATUS_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const raw = await res.json();
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
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @zkqes/web exec vitest run src/hooks/useCeremonyPhase.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/web add \
  packages/web/src/hooks/useCeremonyPhase.ts \
  packages/web/src/hooks/useCeremonyPhase.test.ts
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): useCeremonyPhase hook — single source of phase reads

Polls prove.zkqes.org/ceremony/status.json every 30s, parses with
parseStatusPayload (handles legacy payloads without phase). Returns
{phase, status, error, isLoading}; consumed by Landing, /ceremony,
and the app-route preview banner."
```

---

## Task 2 — Shared chrome: `Marquee` + `FooterRibbon`

**Files:**
- Create: `packages/web/src/components/civic-terminal/Marquee.tsx`
- Create: `packages/web/src/components/civic-terminal/FooterRibbon.tsx`
- Create: `packages/web/src/components/civic-terminal/Marquee.test.tsx`
- Create: `packages/web/src/components/civic-terminal/FooterRibbon.test.tsx`

Extract the chrome components used on every surface family. Marquee renders the phase LED + count + right-sidebar attestations text; FooterRibbon renders `{BUILD_SHA_7} · {BUILD_DATE} · zkqes.org`.

- [ ] **Step 1: Write the failing Marquee test**

```typescript
// packages/web/src/components/civic-terminal/Marquee.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Marquee } from './Marquee';

describe('Marquee', () => {
  it('renders yellow LED + recruiting label when phase=recruiting', () => {
    render(<Marquee phase="recruiting" round={0} totalRounds={10} sidebarText="awaiting" />);
    const led = screen.getByLabelText('phase: recruiting');
    expect(led).toBeInTheDocument();
    expect(led.getAttribute('data-led-color')).toBe('yellow');
    expect(screen.getByText(/round 0 of 10/i)).toBeInTheDocument();
  });

  it('renders empty-state count when totalRounds=0', () => {
    render(<Marquee phase="recruiting" round={0} totalRounds={0} sidebarText="" />);
    expect(screen.getByText('round — of —')).toBeInTheDocument();
  });

  it('renders green LED + ceremony-live when phase=ceremony-live', () => {
    render(<Marquee phase="ceremony-live" round={3} totalRounds={10} sidebarText="" />);
    const led = screen.getByLabelText('phase: ceremony-live');
    expect(led.getAttribute('data-led-color')).toBe('green');
    expect(screen.getByText(/round 3 of 10/i)).toBeInTheDocument();
  });

  it('renders blue LED + live label when phase=live', () => {
    render(<Marquee phase="live" round={10} totalRounds={10} sidebarText="" />);
    const led = screen.getByLabelText('phase: live');
    expect(led.getAttribute('data-led-color')).toBe('blue');
  });

  it('renders sidebar text when provided', () => {
    render(<Marquee phase="recruiting" round={0} totalRounds={10} sidebarText="awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)" />);
    expect(screen.getByText(/awaiting first contributor/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @zkqes/web exec vitest run src/components/civic-terminal/Marquee.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Marquee**

```tsx
// packages/web/src/components/civic-terminal/Marquee.tsx
import type { CeremonyPhase } from '../../lib/ceremonyStatus';

interface MarqueeProps {
  phase: CeremonyPhase;
  round: number;
  totalRounds: number;
  sidebarText: string;
}

const LED_COLORS: Record<CeremonyPhase, string> = {
  recruiting: 'yellow',
  'ceremony-live': 'green',
  live: 'blue',
};

const PHASE_TEXT: Record<CeremonyPhase, string> = {
  recruiting: 'recruiting',
  'ceremony-live': 'ceremony-live',
  live: 'live',
};

function formatCount(round: number, totalRounds: number, phase: CeremonyPhase): string {
  if (totalRounds === 0) return 'round — of —';
  if (phase === 'live' && round >= totalRounds) return `round ${totalRounds} of ${totalRounds} · complete`;
  if (phase === 'ceremony-live') return `round ${round} of ${totalRounds} · in progress`;
  return `round ${round} of ${totalRounds}`;
}

export function Marquee({ phase, round, totalRounds, sidebarText }: MarqueeProps) {
  const ledColor = LED_COLORS[phase];
  return (
    <div
      className="ct-panel ct-panel--raised"
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 260px',
        padding: 'var(--ct-pad)',
        fontFamily: 'var(--display)',
        fontSize: '22px',
        color: 'var(--ct-ink)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          aria-label={`phase: ${phase}`}
          data-led-color={ledColor}
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: `var(--${ledColor === 'yellow' ? 'ua-yellow' : ledColor === 'green' ? 'ok' : 'eu-blue'})`,
          }}
        />
        <span>{PHASE_TEXT[phase]}</span>
      </div>
      <div style={{ textAlign: 'center' }}>{formatCount(round, totalRounds, phase)}</div>
      <div style={{ textAlign: 'right', fontSize: '13px', fontFamily: 'var(--mono)' }}>
        {sidebarText}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run Marquee test to verify it passes**

```bash
pnpm -F @zkqes/web exec vitest run src/components/civic-terminal/Marquee.test.tsx
```

Expected: PASS — 5/5.

- [ ] **Step 5: Write the failing FooterRibbon test**

```typescript
// packages/web/src/components/civic-terminal/FooterRibbon.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FooterRibbon } from './FooterRibbon';

describe('FooterRibbon', () => {
  it('renders sha · date · zkqes.org', () => {
    render(<FooterRibbon buildSha="abc1234" buildDate="2026-05-04" />);
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-04/)).toBeInTheDocument();
    expect(screen.getByText(/zkqes\.org/)).toBeInTheDocument();
  });

  it('truncates a longer SHA to 7 chars', () => {
    render(<FooterRibbon buildSha="abc1234567890" buildDate="2026-05-04" />);
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.queryByText(/abc1234567/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement FooterRibbon**

```tsx
// packages/web/src/components/civic-terminal/FooterRibbon.tsx
interface FooterRibbonProps {
  buildSha: string;
  buildDate: string;
}

export function FooterRibbon({ buildSha, buildDate }: FooterRibbonProps) {
  const sha7 = buildSha.slice(0, 7);
  return (
    <footer
      className="ct-panel"
      role="contentinfo"
      style={{
        marginTop: 'auto',
        padding: '8px var(--ct-pad)',
        fontFamily: 'var(--mono)',
        fontSize: '11px',
        color: 'var(--ct-mute)',
        textAlign: 'center',
      }}
    >
      {sha7} · {buildDate} · zkqes.org
    </footer>
  );
}
```

- [ ] **Step 7: Run all tests + commit**

```bash
pnpm -F @zkqes/web exec vitest run src/components/civic-terminal/
```

Expected: 7/7 tests passing.

```bash
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/components/civic-terminal/
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): Marquee + FooterRibbon shared civic-terminal chrome

Marquee renders phase LED (yellow/green/blue per phase) + round count
+ right sidebar text. Empty-state for totalRounds=0 emits
'round — of —' per HN-screenshot mitigation. aria-label on the LED
makes phase available to screen readers.

FooterRibbon emits {sha7} · {date} · zkqes.org per BRAND.md
v2-amendment §Footer ribbon."
```

---

## Task 3 — Landing state-machine wiring

**Files:**
- Modify: `packages/web/src/components/CivicTerminalLanding.tsx`
- Create: `packages/web/src/components/CivicTerminalLanding.test.tsx`

Wire the existing landing prototype to `useCeremonyPhase`. Replace the hard-coded marquee + sidebar copy with phase-driven values per spec §3 table.

- [ ] **Step 1: Read the existing landing prototype**

```bash
wc -l packages/web/src/components/CivicTerminalLanding.tsx
grep -n "marquee\|recruiting\|round" packages/web/src/components/CivicTerminalLanding.tsx | head -10
```

The prototype is 491 lines; identify the marquee block + binding-statement preview block + right-sidebar block + disabled-tabs block. These are the four state-machine touch points per spec §3.

- [ ] **Step 2: Write the failing test**

```typescript
// packages/web/src/components/CivicTerminalLanding.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CivicTerminalLanding } from './CivicTerminalLanding';

vi.mock('../hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: vi.fn(),
}));

import { useCeremonyPhase } from '../hooks/useCeremonyPhase';

describe('CivicTerminalLanding (phase-driven)', () => {
  it('renders recruiting state when phase=recruiting', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({
      phase: 'recruiting',
      status: { round: 0, totalRounds: 10, contributors: [], finalZkeySha256: null, beaconBlockHeight: null, beaconHash: null, phase: 'recruiting' },
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: recruiting')).toBeInTheDocument();
    expect(screen.getByText(/round 0 of 10/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting first contributor/i)).toBeInTheDocument();
  });

  it('renders ceremony-live state when phase=ceremony-live', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({
      phase: 'ceremony-live',
      status: { round: 4, totalRounds: 10, contributors: [], finalZkeySha256: null, beaconBlockHeight: null, beaconHash: null, phase: 'ceremony-live' },
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: ceremony-live')).toBeInTheDocument();
    expect(screen.getByText(/round 4 of 10/i)).toBeInTheDocument();
  });

  it('falls back to recruiting state when status is unreachable', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({
      phase: null,
      status: null,
      error: 'network',
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    expect(screen.getByLabelText('phase: recruiting')).toBeInTheDocument();
    expect(screen.getByText('round — of —')).toBeInTheDocument();
  });

  it('renders disabled-tab tooltip on Register/Rotate/Verify when phase != live', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({
      phase: 'recruiting',
      status: { round: 0, totalRounds: 10, contributors: [], finalZkeySha256: null, beaconBlockHeight: null, beaconHash: null, phase: 'recruiting' },
      error: null,
      isLoading: false,
    });
    render(<CivicTerminalLanding />);
    const registerTab = screen.getByText(/register/i);
    expect(registerTab.closest('[title]')?.getAttribute('title')).toBe('Available after trusted setup ceremony + Base Sepolia testnet deploy');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm -F @zkqes/web exec vitest run src/components/CivicTerminalLanding.test.tsx
```

Expected: FAIL — landing doesn't consume `useCeremonyPhase` yet.

- [ ] **Step 4: Wire `useCeremonyPhase` into the landing**

In `packages/web/src/components/CivicTerminalLanding.tsx`:

1. Import `useCeremonyPhase` and the new `Marquee` component.
2. Add `const { phase, status, error } = useCeremonyPhase();` near the top of the function.
3. Compute `effectivePhase = phase ?? 'recruiting'` (fallback when status unreachable).
4. Compute `effectiveTotal = status?.totalRounds ?? 0` and `effectiveRound = status?.round ?? 0`.
5. Replace the existing hard-coded marquee block with `<Marquee phase={effectivePhase} round={effectiveRound} totalRounds={effectiveTotal} sidebarText={sidebarTextForPhase(effectivePhase)} />` where `sidebarTextForPhase` is a local helper:

```tsx
function sidebarTextForPhase(phase: CeremonyPhase): string {
  if (phase === 'recruiting') return 'awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)';
  if (phase === 'ceremony-live') return 'last 7 attested rounds + current-round pulse';
  return 'full chain + beacon panel';
}
```

6. Add the disabled-tabs tooltip: when `effectivePhase !== 'live'`, the Register / Rotate / Verify tabs render with `title="Available after trusted setup ceremony + Base Sepolia testnet deploy"` and `.ct-tab--off`. When `'live'`, they're active links.

7. Binding-statement preview: when `effectivePhase !== 'live'`, render `.ct-tag--warn` PRE-LAUNCH chip below the preview text. When `'live'`, replace with a "Sign in →" link to `app.zkqes.org/ua/registerV5`.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm -F @zkqes/web exec vitest run src/components/CivicTerminalLanding.test.tsx
```

Expected: PASS — 4/4.

- [ ] **Step 6: Visual smoke**

```bash
pnpm -F @zkqes/web dev
# Open http://localhost:5173/?variant=civic-terminal
# Confirm marquee shows "recruiting" with yellow LED.
# Open dev tools → mock fetch with phase=ceremony-live in console; confirm the LED flips.
```

- [ ] **Step 7: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/web add \
  packages/web/src/components/CivicTerminalLanding.tsx \
  packages/web/src/components/CivicTerminalLanding.test.tsx
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): wire Landing to useCeremonyPhase state machine

Marquee, binding-statement preview, sidebar attestations text, and
disabled-tab tooltip all driven by status.json.phase. Recruiting +
ceremony-live + live render distinct content per spec §3 table.
Network-failure fallback shows recruiting + 'round — of —' per
spec §4.5 fallback contract."
```

---

## Task 4 — `/ceremony` left column: PathCards

**Files:**
- Create: `packages/web/src/components/ceremony/PathCards.tsx`
- Create: `packages/web/src/components/ceremony/PathCards.test.tsx`

Three path cards stacked tightly: LOCAL, CLOUD (Fly), HETZNER. Below: COORD attribution. Per spec §4.2.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/web/src/components/ceremony/PathCards.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PathCards } from './PathCards';

describe('PathCards', () => {
  it('renders three stacked path cards (LOCAL, CLOUD, HETZNER)', () => {
    render(<PathCards />);
    expect(screen.getByText(/LOCAL/)).toBeInTheDocument();
    expect(screen.getByText(/CLOUD/)).toBeInTheDocument();
    expect(screen.getByText(/HETZNER/)).toBeInTheDocument();
    expect(screen.getByText(/≥32 GB RAM · ~20 min · \$0/)).toBeInTheDocument();
    expect(screen.getByText(/Fly\.io · ~20 min · ~\$0\.30/)).toBeInTheDocument();
    expect(screen.getByText(/CCX33 · self-driven · see README/)).toBeInTheDocument();
  });

  it('renders the COORD attribution', () => {
    render(<PathCards />);
    expect(screen.getByText(/COORD: alik\.eth · DM for round assignment/)).toBeInTheDocument();
  });

  it('collapses to COORD-only when collapseToCoord=true', () => {
    render(<PathCards collapseToCoord />);
    expect(screen.queryByText(/LOCAL/)).not.toBeInTheDocument();
    expect(screen.getByText(/COORD: alik\.eth/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (fails — module missing)**

```bash
pnpm -F @zkqes/web exec vitest run src/components/ceremony/PathCards.test.tsx
```

- [ ] **Step 3: Implement PathCards**

```tsx
// packages/web/src/components/ceremony/PathCards.tsx
interface PathCardsProps {
  collapseToCoord?: boolean;
}

export function PathCards({ collapseToCoord = false }: PathCardsProps) {
  return (
    <aside style={{ fontFamily: 'var(--mono)', fontSize: 'var(--ct-fs)', color: 'var(--ct-ink)' }}>
      {!collapseToCoord && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--ct-gap)' }}>
          <li className="ct-panel">
            <span className="ct-tag">LOCAL</span> ─→ ≥32 GB RAM · ~20 min · $0
          </li>
          <li className="ct-panel">
            <a className="ct-tag" href="/scripts/ceremony-coord/cookbooks/fly/README.md">CLOUD</a> ─→ Fly.io · ~20 min · ~$0.30
          </li>
          <li className="ct-panel">
            <a className="ct-tag" href="/#help-with-the-ceremony">HETZNER</a> ─→ CCX33 · self-driven · see README
          </li>
        </ul>
      )}
      <div style={{ marginTop: '24px', borderTop: '1px solid var(--ct-rule-soft)', paddingTop: '12px' }}>
        COORD: alik.eth · DM for round assignment
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test (passes)** + commit

```bash
pnpm -F @zkqes/web exec vitest run src/components/ceremony/PathCards.test.tsx
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/components/ceremony/PathCards.{tsx,test.tsx}
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): /ceremony PathCards left-column component"
```

---

## Task 5 — `/ceremony` middle column: RoundChain

**Files:**
- Create: `packages/web/src/components/ceremony/RoundChain.tsx`
- Create: `packages/web/src/components/ceremony/RoundChain.test.tsx`

Renders rounds 1..N as `.ct-panel` rows with three states: done / in-progress / pending. Per spec §4.3.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/web/src/components/ceremony/RoundChain.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundChain } from './RoundChain';
import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

const baseStatus: CeremonyStatusPayload = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

describe('RoundChain', () => {
  it('renders 10 placeholder rounds when round=0 + totalRounds=10', () => {
    render(<RoundChain status={baseStatus} />);
    expect(screen.getAllByText(/awaiting contributor/).length).toBe(10);
    expect(screen.getByText(/ROUND-ZERO SEED/)).toBeInTheDocument();
  });

  it('renders done rounds with attestation hash + contributor name', () => {
    const status: CeremonyStatusPayload = {
      ...baseStatus,
      round: 2,
      contributors: [
        { name: 'alik.eth', round: 1, completedAt: '2026-05-10T10:00:00Z', attestation: '0xabcd1234' },
      ],
      phase: 'ceremony-live',
    };
    render(<RoundChain status={status} />);
    expect(screen.getByText(/alik\.eth/)).toBeInTheDocument();
    expect(screen.getByText(/0xabcd1234/)).toBeInTheDocument();
    expect(screen.getByText(/ROUND 1/)).toBeInTheDocument();
  });

  it('renders BEACON APPLIED panel when phase=live + beaconHash set', () => {
    const status: CeremonyStatusPayload = {
      ...baseStatus,
      round: 10,
      finalZkeySha256: '0xfinal',
      beaconBlockHeight: 21000000,
      beaconHash: '0xbeacon',
      phase: 'live',
    };
    render(<RoundChain status={status} />);
    expect(screen.getByText(/BEACON APPLIED/)).toBeInTheDocument();
    expect(screen.getByText(/0xbeacon/)).toBeInTheDocument();
  });

  it('renders fallback recruitment-cards-grid when totalRounds=0', () => {
    render(<RoundChain status={{ ...baseStatus, totalRounds: 0 }} />);
    expect(screen.queryByText(/awaiting contributor/)).not.toBeInTheDocument();
    expect(screen.getByText(/contribute a round/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run (fails)** + implement

```tsx
// packages/web/src/components/ceremony/RoundChain.tsx
import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

function truncate(hex: string, chars = 16): string {
  return hex.length > chars ? `${hex.slice(0, chars)}…` : hex;
}

interface RoundChainProps {
  status: CeremonyStatusPayload;
}

export function RoundChain({ status }: RoundChainProps) {
  const { round, totalRounds, contributors, beaconHash, finalZkeySha256, phase } = status;

  if (totalRounds === 0) {
    return (
      <section style={{ display: 'grid', gap: 'var(--ct-gap)', fontFamily: 'var(--mono)' }}>
        <div className="ct-panel ct-panel--raised" style={{ padding: '24px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: '32px' }}>contribute a round</h2>
          <p>round-zero hasn't seeded yet. See the cookbook to participate.</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 'var(--ct-gap)', fontFamily: 'var(--mono)' }}>
      <div className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
        <span className="ct-tag">ROUND-ZERO SEED</span> — admin-bootstrapped
      </div>
      {Array.from({ length: totalRounds }, (_, i) => i + 1).map((roundN) => {
        const done = contributors.find((c) => c.round === roundN - 1) ?? contributors[roundN - 1];
        if (done) {
          return (
            <div key={roundN} className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
              <strong>ROUND {roundN}</strong> · {done.name} · {done.attestation ? truncate(done.attestation) : ''}
              <div style={{ fontSize: '11px', color: 'var(--ct-mute)' }}>
                ✓ verify · {new Date(done.completedAt).toLocaleString()}
              </div>
            </div>
          );
        }
        if (roundN === round + 1 && phase === 'ceremony-live') {
          return (
            <div key={roundN} className="ct-panel ct-panel--raised" style={{ padding: 'var(--ct-pad)' }}>
              <span className="ct-tag ct-tag--warn">ROUND {roundN}</span> · in progress
            </div>
          );
        }
        return (
          <div key={roundN} className="ct-panel" style={{ padding: 'var(--ct-pad)', opacity: 0.5 }}>
            ROUND {roundN} · awaiting contributor
          </div>
        );
      })}
      {phase === 'live' && beaconHash && (
        <div className="ct-panel ct-panel--inset" style={{ padding: 'var(--ct-pad)' }}>
          <span className="ct-tag">BEACON APPLIED</span> · {truncate(beaconHash, 20)}
          {finalZkeySha256 && <div>final zkey: {truncate(finalZkeySha256, 20)}</div>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm -F @zkqes/web exec vitest run src/components/ceremony/RoundChain.test.tsx
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/components/ceremony/RoundChain.{tsx,test.tsx}
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): /ceremony RoundChain middle-column component

Three round states (done/in-progress/pending) per spec §4.3.
Fallback render for totalRounds=0 (recruitment-cards grid promoted)
matches §4.3 + §4.5. BEACON APPLIED panel emits in live phase."
```

---

## Task 6 — `/ceremony` right column: PasteAttestation + TrustBudget + CeremonyFaq + CeremonyShell

**Files:**
- Create: `packages/web/src/components/ceremony/PasteAttestation.tsx`
- Create: `packages/web/src/components/ceremony/TrustBudget.tsx`
- Create: `packages/web/src/components/ceremony/CeremonyFaq.tsx`
- Create: `packages/web/src/components/ceremony/CeremonyShell.tsx`
- Each with a paired `.test.tsx` (collapsed for brevity below — write each test before its implementation)
- Modify: `packages/web/src/routes/ceremony/index.tsx` (rebuild on `CeremonyShell`)

Per spec §4.4. PasteAttestation does **published-list membership + ordering** verification per the spec fix (NOT cryptographic chain verify).

- [ ] **Step 1: PasteAttestation — failing test**

```typescript
// packages/web/src/components/ceremony/PasteAttestation.test.tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PasteAttestation } from './PasteAttestation';
import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

const status: CeremonyStatusPayload = {
  round: 3,
  totalRounds: 10,
  contributors: [
    { name: 'alik.eth', round: 0, completedAt: '2026-05-10T10:00:00Z', attestation: '0xaaa' },
    { name: 'pse.research', round: 1, completedAt: '2026-05-11T10:00:00Z', attestation: '0xbbb' },
    { name: 'mopro', round: 2, completedAt: '2026-05-12T10:00:00Z', attestation: '0xccc' },
  ],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'ceremony-live',
};

describe('PasteAttestation', () => {
  it('shows ✓ result + round + contributor when attestation matches', () => {
    render(<PasteAttestation status={status} />);
    fireEvent.change(screen.getByPlaceholderText(/paste attestation/i), { target: { value: '0xbbb' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.getByText(/✓.*round 1.*pse\.research/i)).toBeInTheDocument();
  });

  it('shows ✗ result when attestation is unknown', () => {
    render(<PasteAttestation status={status} />);
    fireEvent.change(screen.getByPlaceholderText(/paste attestation/i), { target: { value: '0xunknown' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(screen.getByText(/✗.*not part of this ceremony/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement PasteAttestation**

```tsx
// packages/web/src/components/ceremony/PasteAttestation.tsx
import { useState } from 'react';
import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

interface PasteAttestationProps {
  status: CeremonyStatusPayload;
}

interface VerifyResult {
  ok: boolean;
  message: string;
}

export function PasteAttestation({ status }: PasteAttestationProps) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  function handleVerify(): void {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
      setResult({ ok: false, message: '✗ empty input' });
      return;
    }
    const match = status.contributors.find((c) => c.attestation?.toLowerCase() === trimmed);
    if (!match) {
      setResult({ ok: false, message: '✗ not part of this ceremony' });
      return;
    }
    setResult({ ok: true, message: `✓ round ${match.round} · ${match.name}` });
  }

  return (
    <div className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)' }}>
      <h3 className="ct-tag">INSPECT & VERIFY</h3>
      <textarea
        placeholder="paste attestation hash (sha-256 hex)"
        rows={3}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        style={{ width: '100%', fontFamily: 'var(--mono)', marginTop: '8px' }}
      />
      <button
        type="button"
        className="ct-tab"
        onClick={handleVerify}
        style={{ marginTop: '8px' }}
      >
        verify
      </button>
      {result && (
        <p style={{ marginTop: '8px', color: result.ok ? 'var(--ok)' : 'var(--err)' }}>
          {result.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TrustBudget — failing test + implement**

```typescript
// packages/web/src/components/ceremony/TrustBudget.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustBudget } from './TrustBudget';

describe('TrustBudget', () => {
  it('emits "1 of N honest = sound · completed contributors: <names>"', () => {
    render(<TrustBudget contributors={[
      { name: 'alik.eth', round: 0, completedAt: 'x' },
      { name: 'pse.research', round: 1, completedAt: 'y' },
    ] as never} />);
    expect(screen.getByText(/1 of 2 honest = sound/)).toBeInTheDocument();
    expect(screen.getByText(/alik\.eth/)).toBeInTheDocument();
    expect(screen.getByText(/pse\.research/)).toBeInTheDocument();
  });
});
```

```tsx
// packages/web/src/components/ceremony/TrustBudget.tsx
import type { CeremonyContributor } from '../../lib/ceremonyStatus';

interface TrustBudgetProps {
  contributors: readonly CeremonyContributor[];
}

export function TrustBudget({ contributors }: TrustBudgetProps) {
  if (contributors.length === 0) {
    return (
      <p className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
        trust budget: awaiting first contributor
      </p>
    );
  }
  const names = contributors.map((c) => c.name).join(', ');
  return (
    <p className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
      <strong>1 of {contributors.length} honest = sound</strong> · completed contributors: {names}
    </p>
  );
}
```

- [ ] **Step 4: CeremonyFaq — implement (no test for accordion behavior; static content)**

```tsx
// packages/web/src/components/ceremony/CeremonyFaq.tsx
const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  { q: "what's a trusted setup", a: "A multi-party ceremony that produces the Groth16 proving key. As long as one contributor honestly destroys their entropy, the resulting key is sound." },
  { q: 'why 32 GB RAM', a: 'snarkjs zkey contribute peaks at ~30 GB during the contribution. Cloud paths offload this to a remote VM.' },
  { q: 'what does verify do here', a: 'It looks up the pasted SHA-256 in the published attestation list and confirms which round/contributor it corresponds to. Cryptographic chain verify (~30 GB peak) is offered separately as the zkqes verify-ceremony CLI.' },
  { q: 'how do I know my entropy was independent', a: "It's destroyed in your own machine, never leaving it. Cookbook commands show exactly what runs locally." },
];

export function CeremonyFaq() {
  return (
    <details className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
      <summary style={{ cursor: 'pointer' }}>FAQ</summary>
      <dl>
        {FAQ_ITEMS.map(({ q, a }) => (
          <div key={q} style={{ marginTop: '8px' }}>
            <dt><strong>{q}</strong></dt>
            <dd style={{ marginLeft: 0 }}>{a}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
```

- [ ] **Step 5: CeremonyShell — composition + Marquee/FooterRibbon chrome**

```tsx
// packages/web/src/components/ceremony/CeremonyShell.tsx
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';
import { Marquee } from '../civic-terminal/Marquee';
import { FooterRibbon } from '../civic-terminal/FooterRibbon';
import { PathCards } from './PathCards';
import { RoundChain } from './RoundChain';
import { PasteAttestation } from './PasteAttestation';
import { TrustBudget } from './TrustBudget';
import { CeremonyFaq } from './CeremonyFaq';

const BUILD_SHA = import.meta.env.VITE_BUILD_SHA ?? 'dev';
const BUILD_DATE = import.meta.env.VITE_BUILD_DATE ?? new Date().toISOString().slice(0, 10);

export function CeremonyShell() {
  const { phase, status, error } = useCeremonyPhase();
  const effectivePhase = phase ?? 'recruiting';
  const totalRounds = status?.totalRounds ?? 0;
  const round = status?.round ?? 0;
  const collapseLeft = error !== null && totalRounds === 0;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--ct-paper)' }}>
      <Marquee phase={effectivePhase} round={round} totalRounds={totalRounds} sidebarText="" />
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 260px', gap: 'var(--ct-gap)', padding: 'var(--ct-pad)', flex: 1 }}>
        <PathCards collapseToCoord={collapseLeft} />
        {status ? <RoundChain status={status} /> : <RoundChain status={{
          round: 0, totalRounds: 0, contributors: [],
          finalZkeySha256: null, beaconBlockHeight: null, beaconHash: null,
          phase: 'recruiting',
        }} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ct-gap)' }}>
          {status && <PasteAttestation status={status} />}
          {status && <TrustBudget contributors={status.contributors} />}
          <CeremonyFaq />
        </div>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
```

- [ ] **Step 6: Wire `CeremonyShell` into `/ceremony` route**

In `packages/web/src/routes/ceremony/index.tsx` — replace the body return with `<CeremonyShell />`. Keep the existing `Link` imports if used elsewhere; otherwise prune.

- [ ] **Step 7: Run all ceremony tests + commit**

```bash
pnpm -F @zkqes/web exec vitest run src/components/ceremony/
pnpm -F @zkqes/web build
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/components/ceremony/ packages/web/src/routes/ceremony/index.tsx
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): /ceremony 3-col civic-terminal shell rebuild

PathCards (left) + RoundChain (middle) + PasteAttestation +
TrustBudget + CeremonyFaq (right). Driven by useCeremonyPhase;
fallback render when status unreachable per spec §4.5. Replaces
prior /ceremony index.tsx body."
```

---

## Task 7 — `PreviewModeBanner`

**Files:**
- Create: `packages/web/src/components/app/PreviewModeBanner.tsx`
- Create: `packages/web/src/components/app/PreviewModeBanner.test.tsx`

Banner emitted on `/register`, `/account/rotate`, `/verify` whenever phase ≠ live. Per spec §5.4.

- [ ] **Step 1: Failing test**

```typescript
// packages/web/src/components/app/PreviewModeBanner.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewModeBanner } from './PreviewModeBanner';

vi.mock('../../hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: vi.fn(),
}));
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';

describe('PreviewModeBanner', () => {
  it('renders banner when phase=recruiting', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({ phase: 'recruiting' });
    render(<PreviewModeBanner />);
    expect(screen.getByText(/PREVIEW MODE/i)).toBeInTheDocument();
    expect(screen.getByText(/stub verifier/i)).toBeInTheDocument();
  });

  it('renders banner when phase=ceremony-live', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({ phase: 'ceremony-live' });
    render(<PreviewModeBanner />);
    expect(screen.getByText(/PREVIEW MODE/i)).toBeInTheDocument();
  });

  it('renders nothing when phase=live', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({ phase: 'live' });
    const { container } = render(<PreviewModeBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when phase is null (network failure — conservative)', () => {
    (useCeremonyPhase as ReturnType<typeof vi.fn>).mockReturnValue({ phase: null });
    render(<PreviewModeBanner />);
    expect(screen.getByText(/PREVIEW MODE/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// packages/web/src/components/app/PreviewModeBanner.tsx
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';

const PREVIEW_COPY = 'PREVIEW MODE — ceremony in progress · verifications use stub verifier · proofs are NOT trusted for production';

export function PreviewModeBanner() {
  const { phase } = useCeremonyPhase();
  if (phase === 'live') return null;
  return (
    <div
      role="status"
      className="ct-tag--warn"
      style={{
        padding: '12px var(--ct-pad)',
        fontFamily: 'var(--mono)',
        fontSize: '13px',
        textAlign: 'center',
      }}
    >
      ◐ {PREVIEW_COPY}
    </div>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm -F @zkqes/web exec vitest run src/components/app/PreviewModeBanner.test.tsx
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/components/app/PreviewModeBanner.{tsx,test.tsx}
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): PreviewModeBanner for non-live phases

Renders on /register, /account/rotate, /verify when phase != live.
Conservative — emits when phase=null (network failure) too, since
we can't prove we're in live state."
```

---

## Task 8 — `DeviceReadinessGate`

**Files:**
- Create: `packages/web/src/components/app/DeviceReadinessGate.tsx`
- Create: `packages/web/src/components/app/DeviceReadinessGate.test.tsx`
- Modify: `packages/web/src/lib/deviceGate.ts` (add v2 `assessV2DeviceCapability`)

Per spec §5.0. Two acceptance paths: Firefox≥120 + deviceMemory≥8 OR `zkqes serve` at `localhost:9080`.

- [ ] **Step 1: Add v2 capability check to `deviceGate.ts`**

Append to `packages/web/src/lib/deviceGate.ts` (do NOT remove the existing `assessDeviceCapability` — leave it for any consumers that haven't migrated):

```typescript
// V2 civic-terminal capability check (per spec §5.0). Two acceptance
// paths: supported browser + RAM, OR zkqes serve detected at localhost.
// Replaces V5.0 mobile-flagship-acceptance for civic-terminal v2 surfaces;
// the older assessDeviceCapability stays for /ua/use-desktop legacy flow
// during rollout.
export type V2DeviceCapability =
  | { kind: 'ready-browser'; browser: string; deviceMemory: number }
  | { kind: 'ready-cli' }
  | {
      kind: 'denied';
      detected: { browser: string; deviceMemory: number | 'unknown' };
    };

const FIREFOX_RE = /Firefox\/(\d+)/;
const FIREFOX_DERIV_RE = /Seamonkey|PaleMoon|Waterfox/;

export function assessV2BrowserCapability(): V2DeviceCapability {
  if (typeof navigator === 'undefined') {
    return { kind: 'denied', detected: { browser: 'unknown', deviceMemory: 'unknown' } };
  }
  const ua = navigator.userAgent ?? '';
  const ffMatch = ua.match(FIREFOX_RE);
  const isFirefox = ffMatch !== null && !FIREFOX_DERIV_RE.test(ua);
  const ffVersion = isFirefox ? Number(ffMatch?.[1] ?? 0) : 0;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

  if (isFirefox && ffVersion >= 120 && typeof deviceMemory === 'number' && deviceMemory >= 8) {
    return { kind: 'ready-browser', browser: `Firefox ${ffVersion}`, deviceMemory };
  }

  // Also reject in-app webviews via the existing helper (Telegram, IG, etc.)
  // — these never make it past the path-1 check; we surface them in the
  // Detected line.
  const browserLabel = isFirefox
    ? `Firefox ${ffVersion}`
    : ua.includes('Chrome/') ? 'Chrome (Chromium)'
    : ua.includes('Safari/') ? 'Safari'
    : 'unknown browser';
  return {
    kind: 'denied',
    detected: { browser: browserLabel, deviceMemory: typeof deviceMemory === 'number' ? deviceMemory : 'unknown' },
  };
}
```

- [ ] **Step 2: Failing tests for the gate component**

```typescript
// packages/web/src/components/app/DeviceReadinessGate.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceReadinessGate } from './DeviceReadinessGate';

vi.mock('../../lib/deviceGate', () => ({
  assessV2BrowserCapability: vi.fn(),
}));
vi.mock('../../hooks/useCliPresence', () => ({
  useCliPresence: vi.fn(),
}));

import { assessV2BrowserCapability } from '../../lib/deviceGate';
import { useCliPresence } from '../../hooks/useCliPresence';

describe('DeviceReadinessGate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders ready-browser state when Firefox + RAM check passes', () => {
    (assessV2BrowserCapability as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'ready-browser', browser: 'Firefox 121', deviceMemory: 16 });
    (useCliPresence as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'absent' });
    render(<DeviceReadinessGate><div data-testid="form-step-1">step 1</div></DeviceReadinessGate>);
    expect(screen.getByText(/DEVICE READY/i)).toBeInTheDocument();
    expect(screen.getByText(/Firefox 121.*16 GB/i)).toBeInTheDocument();
    expect(screen.getByTestId('form-step-1')).toBeInTheDocument();
  });

  it('renders ready-cli state when CLI is detected (regardless of browser)', () => {
    (assessV2BrowserCapability as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'denied', detected: { browser: 'Chrome', deviceMemory: 8 } });
    (useCliPresence as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'present' });
    render(<DeviceReadinessGate><div data-testid="form-step-1">step 1</div></DeviceReadinessGate>);
    expect(screen.getByText(/CLI DETECTED/i)).toBeInTheDocument();
    expect(screen.getByTestId('form-step-1')).toBeInTheDocument();
  });

  it('renders denied state with options A + B when browser fails + CLI absent', () => {
    (assessV2BrowserCapability as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'denied', detected: { browser: 'Chrome 130', deviceMemory: 8 } });
    (useCliPresence as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'absent' });
    render(<DeviceReadinessGate><div data-testid="form-step-1">step 1</div></DeviceReadinessGate>);
    expect(screen.getByText(/DEVICE NOT READY/i)).toBeInTheDocument();
    expect(screen.getByText(/OPTION A/)).toBeInTheDocument();
    expect(screen.getByText(/OPTION B/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome 130.*8/)).toBeInTheDocument();
    expect(screen.queryByTestId('form-step-1')).not.toBeInTheDocument();
  });

  it('flips from denied to ready-cli when CLI presence changes', async () => {
    (assessV2BrowserCapability as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'denied', detected: { browser: 'Chrome', deviceMemory: 8 } });
    (useCliPresence as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'absent' });
    const { rerender } = render(<DeviceReadinessGate><div data-testid="form-step-1">step 1</div></DeviceReadinessGate>);
    expect(screen.queryByTestId('form-step-1')).not.toBeInTheDocument();
    (useCliPresence as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'present' });
    rerender(<DeviceReadinessGate><div data-testid="form-step-1">step 1</div></DeviceReadinessGate>);
    expect(screen.getByTestId('form-step-1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement DeviceReadinessGate**

```tsx
// packages/web/src/components/app/DeviceReadinessGate.tsx
import { type ReactNode, useEffect, useState } from 'react';
import { assessV2BrowserCapability, type V2DeviceCapability } from '../../lib/deviceGate';
import { useCliPresence } from '../../hooks/useCliPresence';

interface DeviceReadinessGateProps {
  children: ReactNode;
}

export function DeviceReadinessGate({ children }: DeviceReadinessGateProps) {
  const [browserCheck, setBrowserCheck] = useState<V2DeviceCapability | null>(null);
  const cli = useCliPresence();

  useEffect(() => {
    setBrowserCheck(assessV2BrowserCapability());
  }, []);

  if (browserCheck === null) {
    return (
      <div className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)' }}>
        ◐ checking your device …
      </div>
    );
  }

  // CLI always wins
  if (cli.status === 'present') {
    return (
      <>
        <div className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)' }}>
          <span className="ct-tag">DEVICE READY · CLI DETECTED</span><br />
          ✓ zkqes serve detected at localhost:9080<br />
          <small>proving will offload to native rapidsnark · ~14 s</small>
        </div>
        {children}
      </>
    );
  }

  if (browserCheck.kind === 'ready-browser') {
    return (
      <>
        <div className="ct-panel" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)' }}>
          <span className="ct-tag">DEVICE READY</span><br />
          ✓ {browserCheck.browser} · {browserCheck.deviceMemory} GB+ RAM detected<br />
          <small>proving will run in a Web Worker · ~90 s · ~38 GB peak</small>
        </div>
        {children}
      </>
    );
  }

  const detected = browserCheck.kind === 'denied' ? browserCheck.detected : { browser: '?', deviceMemory: '?' };
  return (
    <div className="ct-panel ct-tag--warn" style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)' }}>
      <strong>DEVICE NOT READY</strong>
      <p>This device can't run the prover. You have two options:</p>
      <div className="ct-panel" style={{ marginTop: '12px', padding: '12px' }}>
        <strong>OPTION A · Firefox 64-bit ≥120 with 32 GB RAM</strong>
        <p>Open this page in Firefox on a desktop with 32 GB+ RAM. Proving runs in a Web Worker; ~90 s wall time, ~38 GB peak memory.</p>
        <p><small>Detected: {detected.browser} · {detected.deviceMemory}</small></p>
      </div>
      <div className="ct-panel" style={{ marginTop: '12px', padding: '12px' }}>
        <strong>OPTION B · Install zkqes CLI prover</strong>
        <p>Run native rapidsnark locally; the browser auto-detects it. ~14 s wall time, ~3.7 GB peak. Works on any browser.</p>
        <pre style={{ background: 'var(--ct-paper-3)', padding: '8px', borderRadius: '2px' }}>
          {`▣ npm install -g @zkqes/cli\n▣ zkqes serve`}
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run + commit**

```bash
pnpm -F @zkqes/web exec vitest run src/components/app/DeviceReadinessGate.test.tsx src/lib/deviceGate.test.ts
git -C /data/Develop/qkb-wt-v5/web add \
  packages/web/src/components/app/DeviceReadinessGate.{tsx,test.tsx} \
  packages/web/src/lib/deviceGate.ts
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): DeviceReadinessGate with browser+CLI dual paths

Per spec §5.0. Either Firefox≥120+deviceMemory≥8 OR zkqes serve
detected unlocks the form. denied state shows Detected line + option
A (Firefox install) + option B (CLI install copy-paste). Re-evaluates
when useCliPresence changes (live unlock without reload).

assessV2BrowserCapability added to lib/deviceGate.ts; existing
assessDeviceCapability stays exported for /ua/use-desktop legacy
flow during rollout."
```

---

## Task 9 — `/register` single-long-form refactor

**Files:**
- Modify: `packages/web/src/routes/ua/registerV5.tsx`

Replace the multi-step navigate-by-state pattern with a single scrolling document containing all 6 sections. Wire `<DeviceReadinessGate>` at top + `<PreviewModeBanner>` between gate and form. Per spec §5.1.

- [ ] **Step 1: Read the current shape**

```bash
cat packages/web/src/routes/ua/registerV5.tsx
```

The current structure has `step` state from 1–4, and renders a single Step1/Step2/Step3/Step4 component at a time. v2 single-long-form keeps the four step components but renders ALL of them stacked, with the active section highlighted via a sticky header strip.

- [ ] **Step 2: Refactor to single-long-form**

```tsx
// packages/web/src/routes/ua/registerV5.tsx (rewrite)
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { Step1ConnectWallet } from '../../components/ua/v5/Step1ConnectWallet';
import { Step2GenerateBinding } from '../../components/ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../../components/ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../../components/ua/v5/Step4ProveAndRegister';

type StepNumber = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<StepNumber, string> = {
  1: 'CONNECT WALLET',
  2: 'GENERATE BINDING STATEMENT',
  3: 'SIGN WITH DIIA QES',
  4: 'PROVE & REGISTER',
};

export function RegisterV5Screen() {
  const { t } = useTranslation();
  const [active, setActive] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--ct-paper)' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px' }}>
        <header style={{ marginBottom: '24px' }}>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: '40px' }}>{t('registerV5.title')}</h1>
          <p>{t('registerV5.lede')}</p>
        </header>
        <PreviewModeBanner />
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--ct-paper)', padding: '8px 0' }}>
          <strong>STEP {active} of 4 · {STEP_LABELS[active]}</strong>
          <div style={{ height: '4px', background: 'var(--ct-paper-3)' }}>
            <div style={{ width: `${(active / 4) * 100}%`, height: '100%', background: 'var(--ua-blue)' }} />
          </div>
        </div>
        <DeviceReadinessGate>
          <section aria-labelledby="step-1-heading" onFocus={() => setActive(1)}>
            <h2 id="step-1-heading" className="ct-tag">01 · {STEP_LABELS[1]}</h2>
            <Step1ConnectWallet />
          </section>
          <hr className="ct-civic-stripe" aria-hidden />
          <section aria-labelledby="step-2-heading" onFocus={() => setActive(2)}>
            <h2 id="step-2-heading" className="ct-tag">02 · {STEP_LABELS[2]}</h2>
            <Step2GenerateBinding onBindingReady={setBindingBytes} />
          </section>
          <hr className="ct-civic-stripe" aria-hidden />
          <section aria-labelledby="step-3-heading" onFocus={() => setActive(3)}>
            <h2 id="step-3-heading" className="ct-tag">03 · {STEP_LABELS[3]}</h2>
            <Step3DiiaSign bindingBytes={bindingBytes} onSigned={setP7s} />
          </section>
          <hr className="ct-civic-stripe" aria-hidden />
          <section aria-labelledby="step-4-heading" onFocus={() => setActive(4)}>
            <h2 id="step-4-heading" className="ct-tag">04 · {STEP_LABELS[4]}</h2>
            <Step4ProveAndRegister bindingBytes={bindingBytes} p7s={p7s} />
          </section>
        </DeviceReadinessGate>
      </div>
    </main>
  );
}
```

NOTE: the existing `Step2GenerateBinding`, `Step3DiiaSign`, `Step4ProveAndRegister` may not yet accept the prop signatures shown (`onBindingReady`, `bindingBytes`, etc.) — adapt their existing hand-off pattern (sessionStorage in `lib/session.ts`) and pass the right hooks. Don't refactor the steps' internals; just wire them stacked.

- [ ] **Step 3: Update existing flow tests**

Run the e2e flow test (which already exists) and adjust expectations if any rely on navigate-between-routes behaviour:

```bash
pnpm -F @zkqes/web exec playwright test --project=flow
```

If a test fails because it expects a `/sign` URL transition that no longer happens, update the test to assert on section visibility instead of URL.

- [ ] **Step 4: Run unit tests + e2e**

```bash
pnpm -F @zkqes/web test
pnpm -F @zkqes/web exec playwright test --project=flow
```

- [ ] **Step 5: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/routes/ua/registerV5.tsx
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): /register single-long-form refactor (spec §5.1)

All 6 sections stacked into a 720px-max scrolling document. Sticky
header strip + civic-stripe rules between sections. DeviceReadinessGate
gates the form; PreviewModeBanner emits when phase != live.
Step1-Step4 components reused; only the route shell is new."
```

---

## Task 10 — `/account/rotate` wiring

**Files:**
- Modify: `packages/web/src/components/ua/v5/RotateWalletFlow.tsx`

The existing `RotateWalletFlow` is 965 lines; v2 only adds the gate + banner wrapper.

- [ ] **Step 1: Wrap the body in `<DeviceReadinessGate>` + emit `<PreviewModeBanner>`**

In `RotateWalletFlow.tsx`:

1. Import `DeviceReadinessGate` and `PreviewModeBanner`.
2. Locate the top-level return — wrap whatever currently returns the form sections in `<DeviceReadinessGate>{...children...}</DeviceReadinessGate>`.
3. Render `<PreviewModeBanner />` immediately above the gate (banner always visible regardless of gate state, so user knows preview-mode applies even before gate clears).
4. Adopt the single-long-form sticky-header pattern (same as /register but with `STEP N of 3` per spec §5.2 — the rotation flow already has 3 sigs; if the existing component is multi-route, leave the routing alone and just add the gate + banner).

- [ ] **Step 2: Run tests**

```bash
pnpm -F @zkqes/web test
```

- [ ] **Step 3: Commit**

```bash
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/components/ua/v5/RotateWalletFlow.tsx
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): /account/rotate gate + preview banner wiring

DeviceReadinessGate + PreviewModeBanner added to RotateWalletFlow;
existing 3-step flow internals preserved per spec §5.2 (symmetric
with /register but 3 sections instead of 6)."
```

---

## Task 11 — `/verify` 3-col shell rebuild

**Files:**
- Modify: `packages/web/src/routes/ceremony/verify.tsx`

Per spec §5.3. 3-col shell, two tabs (`by attestation` / `by wallet`), result panel as labeled-row layout via `<dl>`.

- [ ] **Step 1: Refactor**

Replace the current `verify.tsx` body with a 3-col layout reusing `Marquee` + `FooterRibbon` + `PreviewModeBanner`:

```tsx
// packages/web/src/routes/ceremony/verify.tsx (rewrite outline)
import { useState } from 'react';
import { Marquee } from '../../components/civic-terminal/Marquee';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';

const BUILD_SHA = import.meta.env.VITE_BUILD_SHA ?? 'dev';
const BUILD_DATE = import.meta.env.VITE_BUILD_DATE ?? new Date().toISOString().slice(0, 10);

type VerifyTab = 'attestation' | 'wallet';

export function VerifyScreen() {
  const { phase, status } = useCeremonyPhase();
  const [tab, setTab] = useState<VerifyTab>('attestation');
  const [input, setInput] = useState('');
  // result panel state lifted as needed; show <dl> for results

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--ct-paper)' }}>
      <Marquee phase={phase ?? 'recruiting'} round={status?.round ?? 0} totalRounds={status?.totalRounds ?? 0} sidebarText="" />
      <PreviewModeBanner />
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 260px', gap: 'var(--ct-gap)', padding: 'var(--ct-pad)', flex: 1 }}>
        <aside className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
          <h3 className="ct-tag">WHAT THIS VERIFIES</h3>
          <p>Looks up a wallet's nullifier or an attestation hash on the live registry.</p>
        </aside>
        <section style={{ display: 'grid', gap: 'var(--ct-gap)' }}>
          <div role="tablist" style={{ display: 'flex', gap: '8px' }}>
            <button role="tab" aria-selected={tab === 'attestation'} className={tab === 'attestation' ? 'ct-tab' : 'ct-tab ct-tab--off'} onClick={() => setTab('attestation')}>by attestation</button>
            <button role="tab" aria-selected={tab === 'wallet'} className={tab === 'wallet' ? 'ct-tab' : 'ct-tab ct-tab--off'} onClick={() => setTab('wallet')}>by wallet</button>
          </div>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={tab === 'attestation' ? 'paste attestation sha-256' : 'paste wallet address 0x…'} style={{ fontFamily: 'var(--mono)', padding: '8px', width: '100%' }} />
          {/* result <dl> labeled-row layout populated post-lookup; existing
              packages/web/src/lib/* helpers do the on-chain reads */}
        </section>
        <aside className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
          <h3 className="ct-tag">RECENT</h3>
          {/* read from localStorage; render last 10 lookups */}
        </aside>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
```

The actual on-chain lookup logic stays in whatever helper currently powers verify (likely a hook or `lib/*.ts`); only the shell changes. Don't lose any existing functionality — port it into the new shape.

- [ ] **Step 2: Update i18n keys** for the `WHAT THIS VERIFIES` heading + tabs (en + uk).

- [ ] **Step 3: Run tests + commit**

```bash
pnpm -F @zkqes/web test
git -C /data/Develop/qkb-wt-v5/web add packages/web/src/routes/ceremony/verify.tsx packages/web/src/i18n/{en,uk}.json
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(web): /verify 3-col civic-terminal shell

Tabs (by attestation / by wallet) in the middle column; left explainer +
right recent-verifications log. Reuses Marquee / FooterRibbon /
PreviewModeBanner chrome per spec §5.3."
```

---

## Task 12 — docs.zkqes.org VitePress retheme

**Files:**
- Modify: `docs/.vitepress/theme/custom.css`

Per spec §6.1. Mechanical retheme — token rebind only; no layout redesign.

- [ ] **Step 1: Inspect current custom.css**

```bash
cat docs/.vitepress/theme/custom.css
```

- [ ] **Step 2: Rewrite with civic-terminal token bindings**

```css
/* docs/.vitepress/theme/custom.css — civic-terminal v2 retheme */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=VT323&display=swap');

:root {
  --vp-c-bg:           #d8d4c4;
  --vp-c-bg-alt:       #e6e2d2;
  --vp-c-bg-elv:       #c8c4b4;
  --vp-c-text-1:       #1a1a1a;
  --vp-c-text-2:       #3a352c;
  --vp-c-text-3:       #6b6558;
  --vp-c-brand-1:      #0057B7;  /* UA blue */
  --vp-c-brand-2:      #003399;  /* EU blue */
  --vp-c-brand-3:      #FFD700;  /* UA yellow */
  --vp-c-divider:      rgba(26, 26, 26, 0.35);

  --vp-font-family-base: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --vp-font-family-mono: 'IBM Plex Mono', ui-monospace, monospace;
}

.VPNavBar .title {
  font-family: 'VT323', monospace;
  font-size: 28px;
}

.VPSidebar h1, .VPSidebar h2, .VPDoc h1, .VPDoc h2 {
  font-family: 'VT323', monospace;
}

/* Mirror the civic-stripe footer */
.VPDoc::after {
  content: '';
  display: block;
  margin-top: 48px;
  height: 4px;
  background: linear-gradient(to right, #0057B7 0%, #0057B7 25%, #FFD700 25%, #FFD700 50%, #003399 50%, #003399 75%, #FFCC00 75%, #FFCC00 100%);
}
```

- [ ] **Step 3: Smoke + commit**

```bash
pnpm -F @zkqes/docs dev   # if a docs script exists; otherwise:
pnpm vitepress dev docs
# Open http://localhost:5173 and confirm civic-terminal palette + VT323 headers + EB-Garamond gone.
git -C /data/Develop/qkb-wt-v5/web add docs/.vitepress/theme/custom.css
git -C /data/Develop/qkb-wt-v5/web commit -m "feat(docs): VitePress civic-terminal retheme (spec §6.1)

Token rebind only — no layout redesign. EB Garamond → VT323 for
display headers; Inter Tight → IBM Plex Mono for body/code.
4-bar UA+EU stripe at end of every doc."
```

---

## Task 13 — Playwright phase-rendering smoke

**Files:**
- Create: `packages/web/tests/e2e/v2-phase-rendering.spec.ts`

Smoke test that asserts the three phase states render distinct chrome on Landing + /ceremony.

- [ ] **Step 1: Write the test**

```typescript
// packages/web/tests/e2e/v2-phase-rendering.spec.ts
import { test, expect } from '@playwright/test';

const RECRUITING_STATUS = {
  round: 0,
  totalRounds: 10,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};
const CEREMONY_LIVE_STATUS = {
  ...RECRUITING_STATUS,
  round: 4,
  contributors: [
    { name: 'alik.eth', round: 0, completedAt: '2026-05-10T10:00:00Z', attestation: '0xaaa' },
    { name: 'pse.research', round: 1, completedAt: '2026-05-11T10:00:00Z', attestation: '0xbbb' },
    { name: 'mopro', round: 2, completedAt: '2026-05-12T10:00:00Z', attestation: '0xccc' },
    { name: '0xPARC', round: 3, completedAt: '2026-05-13T10:00:00Z', attestation: '0xddd' },
  ],
  phase: 'ceremony-live',
};
const LIVE_STATUS = {
  ...CEREMONY_LIVE_STATUS,
  round: 10,
  finalZkeySha256: '0xfinal',
  beaconBlockHeight: 21000000,
  beaconHash: '0xbeacon',
  phase: 'live',
};

test.describe('v2 phase rendering', () => {
  test('Landing — recruiting state', async ({ page }) => {
    await page.route('**/ceremony/status.json', (route) => route.fulfill({
      status: 200, body: JSON.stringify(RECRUITING_STATUS),
    }));
    await page.goto('/?variant=civic-terminal');
    await expect(page.getByLabel('phase: recruiting')).toBeVisible();
    await expect(page.getByText(/round 0 of 10/i)).toBeVisible();
    await expect(page.getByText(/awaiting first contributor/i)).toBeVisible();
  });

  test('Landing — ceremony-live state', async ({ page }) => {
    await page.route('**/ceremony/status.json', (route) => route.fulfill({
      status: 200, body: JSON.stringify(CEREMONY_LIVE_STATUS),
    }));
    await page.goto('/?variant=civic-terminal');
    await expect(page.getByLabel('phase: ceremony-live')).toBeVisible();
    await expect(page.getByText(/round 4 of 10/i)).toBeVisible();
  });

  test('Landing — live state', async ({ page }) => {
    await page.route('**/ceremony/status.json', (route) => route.fulfill({
      status: 200, body: JSON.stringify(LIVE_STATUS),
    }));
    await page.goto('/?variant=civic-terminal');
    await expect(page.getByLabel('phase: live')).toBeVisible();
  });

  test('/ceremony — round chain renders done + pending rows', async ({ page }) => {
    await page.route('**/ceremony/status.json', (route) => route.fulfill({
      status: 200, body: JSON.stringify(CEREMONY_LIVE_STATUS),
    }));
    await page.goto('/ceremony');
    await expect(page.getByText('alik.eth')).toBeVisible();
    await expect(page.getByText('pse.research')).toBeVisible();
    await expect(page.getByText(/awaiting contributor/).first()).toBeVisible();
  });

  test('PreviewModeBanner emits on /ua/registerV5 when phase != live', async ({ page }) => {
    await page.route('**/ceremony/status.json', (route) => route.fulfill({
      status: 200, body: JSON.stringify(RECRUITING_STATUS),
    }));
    await page.goto('/ua/registerV5');
    await expect(page.getByText(/PREVIEW MODE/i)).toBeVisible();
  });

  test('PreviewModeBanner does NOT emit when phase=live', async ({ page }) => {
    await page.route('**/ceremony/status.json', (route) => route.fulfill({
      status: 200, body: JSON.stringify(LIVE_STATUS),
    }));
    await page.goto('/ua/registerV5');
    await expect(page.getByText(/PREVIEW MODE/i)).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm -F @zkqes/web exec playwright test tests/e2e/v2-phase-rendering.spec.ts
git -C /data/Develop/qkb-wt-v5/web add packages/web/tests/e2e/v2-phase-rendering.spec.ts
git -C /data/Develop/qkb-wt-v5/web commit -m "test(web): e2e phase-rendering smoke (Landing + /ceremony + app banner)

Six tests covering the three phases × Landing chrome + /ceremony round
chain + PreviewModeBanner on /register. Mocks status.json via
page.route. Catches the most common regression risk in v2
(component reads phase from wrong source / fallback path broken)."
```

---

## Task 14 — Hand-off to lead

- [ ] **Step 1: Push branch**

```bash
git -C /data/Develop/qkb-wt-v5/web push -u origin feat/v2-web-civic-terminal
```

- [ ] **Step 2: Run final acceptance check**

```bash
pnpm -F @zkqes/web test
pnpm -F @zkqes/web typecheck
VITE_TARGET=landing pnpm -F @zkqes/web build
VITE_TARGET=app pnpm -F @zkqes/web build
pnpm -F @zkqes/web exec playwright test
```

All green expected. Report numbers to lead via SendMessage.

- [ ] **Step 3: Lead does merge to main per orchestration §8**

---

## Acceptance gate (worker self-check)

- [ ] All 13 tasks committed on `feat/v2-web-civic-terminal`
- [ ] `pnpm -F @zkqes/web test` → 380+ passing (340 baseline + ~40 new), 0 failures
- [ ] `pnpm -F @zkqes/web typecheck` → green
- [ ] Both `VITE_TARGET=landing` and `VITE_TARGET=app` builds → green
- [ ] Playwright `flow` + `v2-phase-rendering` projects → green
- [ ] No new files outside `packages/web/` and `docs/.vitepress/`
- [ ] No new civic-terminal CSS primitives introduced (only existing `.ct-*` used)
- [ ] Frozen marketer copy (table §0.1) used verbatim in code
- [ ] i18n parity (`tests/unit/i18n.parity.test.ts`) green — every new copy lives in both en + uk

## Self-review notes

- **Spec coverage:**
  - §3 Landing → Tasks 2 + 3
  - §4 /ceremony → Tasks 4 + 5 + 6
  - §5.0 DeviceReadinessGate → Task 8
  - §5.1 /register → Task 9
  - §5.2 /account/rotate → Task 10
  - §5.3 /verify → Task 11
  - §5.4 PreviewModeBanner → Task 7
  - §6.1 docs retheme → Task 12
  - §7 status.json read → Task 1 (`useCeremonyPhase`) + Task 0 (lead-pumped mirror)
  - §8.1 phase-driven content swaps → Tasks 3 + 5 + 6 + 7
- **No placeholders:** every step has runnable code or explicit commands.
- **Type consistency:** `CeremonyPhase` consistent across all tasks. `V2DeviceCapability` introduced in Task 8 used by Task 8 only. `useCliPresence` is the existing `packages/web/src/hooks/useCliPresence.ts` — confirmed before Task 8.
- **Risk:** Task 9 + 10 refactor existing flows that have e2e coverage. The Playwright `flow` project is the regression net; if it fails after the refactor, fix the test to assert on section visibility (single-page flow) instead of URL transitions (multi-route flow).
