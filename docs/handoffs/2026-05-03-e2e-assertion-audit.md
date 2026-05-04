# Playwright e2e silent-pass risk audit

**Task:** #51 — Sweep other e2e specs for wrapping-element silent-pass risk
**Author:** web-eng
**Date:** 2026-05-04
**Companion to:** [`2026-05-03-v5-e2e-silent-pass-postmortem.md`](./2026-05-03-v5-e2e-silent-pass-postmortem.md) (#50)

## Methodology

Per #50 conclusions, the assertion-shape risk surface is small in this
suite — the conditional-render patterns in `src/` correctly gate testids
on state. The dominant risk is the **run-time gate**: no CI workflow
invokes Playwright, so any spec is "silently passing" by default until
someone runs it manually. The audit below classifies each spec's
assertion shape independently of the run-time-gate gap (which is now
proposed task #77 per lead).

For each spec I traced its `expect(...).toBeVisible()` /
`.toContainText()` / `.toHaveCount(0)` assertions back to the
rendering site in `src/`. Risk dimensions:

- **HIGH** — assertion would silently pass even if the underlying
  behaviour broke (testid attached to a permanent / always-rendered
  element; fuzzy selector matches unintended copy; state-independent
  existence check).
- **MEDIUM** — assertion is loose but would still catch most regressions
  in the targeted feature; an adversarial edge case could slip through.
- **LOW** — assertion is tight enough; testid / role / text is
  state-conditional in `src/`; no slip risk.

## Per-spec table

| Spec | Assert count | Risk | Rationale |
|---|---:|---|---|
| `smoke.spec.ts` | 1 | LOW | `getByRole('heading', { name: /Verified Identity/i })` — heading is the landing's load-bearing brand line; state-independent assertion is the test's *purpose* (boot+title sanity). |
| `landing.spec.ts` | 5 | LOW | Mix of `getByRole('heading')` + `getByText` against frozen landing copy + `toHaveURL` after click. Copy strings are marketer-locked + change-controlled. |
| `mobile.spec.ts` | 1 | LOW | Same heading pattern as smoke — narrow viewport sanity. |
| `i18n.spec.ts` | 2 | LOW | Asserts the two-locale heading swap; tightly bound to actual i18n branch. |
| `route-coverage.spec.ts` | 5 | LOW | Heading + `toHaveURL` + table-cell name matchers — each scoped to a specific route's content. |
| `prod-smoke.spec.ts` | 3 | LOW | Iterates a route table asserting per-route headings + connect button presence. Bound to actual route content. |
| `flow-happy.spec.ts` | 1 | LOW | URL transition + Step-page heading (`/Drag proof\.json here/`). Tight. |
| `flow-already-minted.spec.ts` | 1 | LOW | Button-name regex (`/view your certificate/i`) — single-purpose label. |
| `flow-deadline-expired.spec.ts` | 1 | LOW | Button-name regex (`/mint window closed/i`) — single-purpose terminal-state label. |
| `v5-mint.spec.ts` | 1 | LOW | `getByTestId('v5-mint-pending-deploy')` traces to `MintNftStep.tsx:73` inside the early-return `if (!v5Deployed)` branch — state-conditional, would NOT render once `v5Deployed === true`. |
| `v5-register-route.spec.ts` | 5 | **MEDIUM** | `page.getByText(/1 — Connect/i)`, `/2 — Generate/i`, etc. — these are step-indicator labels rendered by `StepIndicatorV5`. The labels render even when steps are inactive (the indicator shows all four), so the assertion verifies "step indicator renders" not "step is reachable". A regression that makes Step 2-4 unreachable wouldn't fail this spec. Mitigant: the assertion's stated purpose IS to verify the indicator structure, not flow advancement. |
| `v5-device-gating.spec.ts` | 2 | **MEDIUM** | `getByTestId('use-desktop-page')` traces to `useDesktop.tsx:25` — the testid is on the `<main>` *wrapping element*, always present whenever the user is on `/ua/use-desktop` for any reason. The test's setup ensures arrival via the gate, but a regression where the user lands on `/ua/use-desktop` for *unrelated* reasons (e.g., a default-redirect bug) would still pass the assertion. The `.toHaveCount(0)` assertion (line 86) is tighter (asserts non-presence), so the inverse is well-covered. |
| `v5-flow.spec.ts` | 7 | LOW (assertion shape) / **HIGH (run-time gate)** | Per #50 postmortem: the assertions are correctly state-gated; the gap was nobody running the test. Out of audit scope here. |
| `ceremony.spec.ts` | 36 | LOW | Largest spec. Sampled testids: `ceremony-state-${state}` template renders with state-suffix only matching the active state; `ceremony-chain-list` / `ceremony-chain-empty` are state-conditional (`payload.contributors.length === 0`); `ceremony-final` gated on `finalZkeySha256` truthy. State-correct gating throughout. |
| `cli-flow.spec.ts` | 0 | N/A | Opt-in via `T7_DEV_MANIFEST` env var — `test.skip(...)` when unset. Same run-time-gate concern as #50: never runs without explicit env. Out of assertion-shape audit. |
| `cli-fallback.spec.ts` | 0 | N/A | Same opt-in pattern. |

## HIGH findings

**None on assertion shape.** The two MEDIUM findings (v5-register-route + v5-device-gating) are loose but their setup preconditions narrow the realistic regression surface so they catch the bugs they're aimed at.

This matches the #50 postmortem's prediction: most assertions in this
suite are state-correctly gated. The dominant silent-pass mode is
**no CI gate runs them**, not **wrong assertion shape**.

## MEDIUM findings — proposed tightenings (not blocking)

1. **`v5-device-gating.spec.ts`**: replace the wrapping `use-desktop-page`
   testid assertion with one that proves the gate redirected for a
   specific reason. E.g., assert on a child element that only renders
   when `assessDeviceCapability()` returned `kind === 'denied'` — currently
   the use-desktop page renders the same chrome regardless of arrival
   reason. Effort: ~30 min. Not blocking V5.2 mainnet.

2. **`v5-register-route.spec.ts`**: the `1 — Connect` etc. step-label
   assertions could be tightened to assert one step's *content* visible
   while others are hidden (matches the actual rendered semantic). The
   current assertions just confirm the indicator exists. Effort: ~20 min.
   Not blocking V5.2 mainnet.

Both are MEDIUM. Neither causes a known V5.2-mainnet-relied-upon code
path to silently pass. Logged here for future cleanup.

## Coverage gap (already proposed as #77)

The dominant silent-pass mechanism — no CI gate runs Playwright at all —
remains the right place to invest. Per #50 follow-ups + lead's
acknowledgment of #77 (CI gate for Playwright e2e):

- Per-PR: smoke + chromium + ceremony projects (~5 min total). Catches
  regressions on the user-visible happy path + ceremony surface.
- Nightly: v5 + v5-device-gating + v5-mint + v5-register-route. Slower
  (mock-prover walkthrough, ~60s aggregate) but bounds drift to a
  24-hour window.
- Opt-in (manual / on-demand): cli-flow + cli-fallback. T7_DEV_MANIFEST
  needed; runner-environment-specific.

## Watchdog (#52) recommendation

Per the #50 postmortem's lower-marginal-value note: with assertion shapes
mostly correct + #77 CI gate proposed, the watchdog adds limited
incremental safety. Defer #52 unless a future assertion-shape bug
surfaces that the audit above missed.

If implemented, target it specifically at the two MEDIUM findings:
synthetically arrive at `/ua/use-desktop` via direct nav (NOT through
the gate) and assert that v5-device-gating's "redirected via gate"
assertion *fails*. Same for v5-register-route's step-label structure.
That'd validate the assertions catch their target regressions without
needing to instrument the entire suite.
