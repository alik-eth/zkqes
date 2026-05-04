# V5.1 e2e silent-pass postmortem

**Task:** #50 — Diagnose `v5-flow.spec.ts:103-118` silent-pass mechanism
**Author:** web-eng
**Date:** 2026-05-04
**Status:** Resolved (V5.2 T2 already folded the guard fix; this doc closes the loop on the *why*)

## Summary

The V5.1 `proveV5` driver carried a hardcoded `publicSignals.length !== 14`
guard (V4-era leftover). V5.1's 19-signal mock pipeline always tripped this
guard and threw `witness.fieldTooLong`. The thrown error was caught at
`Step4ProveAndRegister.tsx::onProveAndRegister`'s `catch` block and surfaced
via `setPipelineError(...)` → an inline `<p role="alert">` panel
(no testid). `pipelineDone` stayed `false`, `submitSkippedReason` stayed
`null`, and the conditional render of
`<p data-testid="v5-submit-skipped">` at line 406 (then identical in V5.1)
never produced its element.

`v5-flow.spec.ts:103-118` asserts
`await expect(page.getByTestId('v5-submit-skipped')).toBeVisible({timeout: 15_000})`
— with no element rendered, the assertion should have timed out and the
test should have failed for ~3 days between the V5.1 length-guard regression
landing (A6.1, 2026-04-30) and V5.2 T2 (which relaxed the guard to a
`[14, 19, 22]` allowlist via `ALLOWED_PUBLIC_SIGNAL_LENGTHS`).

## Root cause

**The test was never run.** No silent-pass mechanism existed at the
DOM/assertion layer; the conditional render is correctly gated. Verified
by exhaustively grepping `.github/workflows/` for Playwright invocations:

```bash
$ grep -lrnE 'playwright test|--project|pnpm.*test:e2e|exec playwright' .github/
$  # zero matches
```

The repo's CI workflows (`pages.yml`, `release-cli.yml`, `pages-docs.yml`)
build + deploy artefacts but **do not run Playwright at all**. The `v5`
project (which `testMatch: /v5-(register-route|mint|flow|device-gating)\.spec\.ts/`
selects v5-flow.spec.ts into) is therefore CI-untested. Whoever
introduced the V5.1 length regression (commit `2264890`, `feat/v5-web`)
didn't manually run `pnpm exec playwright test --project=v5` locally —
which is unsurprising given (a) no CI gate forced them to, (b) the V5.1
work was iterated against the unit + integration suite that DID gate
their commits, and (c) Playwright e2e is in the project's "infrequent
verification gate" tier per the existing CLAUDE.md "How to run" section
(it doesn't list `test:e2e` in the typical-loop verification commands).

The hypotheses-list from the task description, ranked:

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Permanent / wrapping testid element | ❌ Rejected | The `<p data-testid="v5-submit-skipped">` JSX at `Step4ProveAndRegister.tsx:406` (V5.1 + V5.2) is gated on `pipelineDone && submitSkippedReason`; both are null on the throw path. No second element shares the testid. |
| Fuzzy selector matching wrong element | ❌ Rejected | `page.getByTestId('v5-submit-skipped')` resolves to `[data-testid="v5-submit-skipped"]` exactly — no fuzz. |
| `describe.skip` / `test.skip` / `test.fixme` | ❌ Rejected | None present in `v5-flow.spec.ts`. The test is `test('drives Steps 1-4 …', async (...) => {...})`, plain. |
| Playwright config force-skipping the project | ❌ Rejected | The `v5` project in `playwright.config.ts:68-71` has `testMatch: /v5-(register-route\|mint\|flow\|device-gating)\.spec\.ts/` — no `grep`/`grepInvert` skip. |
| **Test was never executed** | ✅ **Root cause** | Zero Playwright invocations across all GitHub Actions workflows; no scheduled local runs documented; "reported pass" likely a misread of "no failure surfaced" by anyone running the typical-loop verification (`pnpm test`, `pnpm typecheck`, smoke-only). |

## Learning

Tests that nobody runs == tests that nobody fails.

The Playwright e2e suite has no CI gate. Until either (a) a CI workflow is
added that runs at minimum `--project=smoke --project=chromium` on every PR,
or (b) the typical-loop verification list in CLAUDE.md elevates the v5
project to a pre-commit gate, regressions like A6.1 → V5.2 will continue to
sit green-by-default for the duration of any work cycle that doesn't pass
through manual `playwright test` invocation.

**Two follow-ups proposed (unscoped, lead's call):**

1. **CI gate for the smoke + chromium projects** — fastest projects (smoke
   is title + boot, chromium is the landing/flow happy path). Adds ~3 min to
   every PR build but caps the silent-pass blast radius. The v5 project is
   slower (full Step1–4 mock-prover walkthrough, ~30s) and could be a
   nightly job rather than per-PR.
2. **Watchdog meta-test** (task #52) — synthetically inject a pipeline
   throw and assert that v5-flow.spec.ts:103-118 *fails*. Catches future
   testid drift even when the underlying pipeline is healthy. Per task
   description this is OPTIONAL pending #50/#51 conclusions; my read is the
   v5-flow assertion shape is correct, the gap is the run-time gate, so
   #52's watchdog adds less marginal value than #50's CI gate proposal.

## Fix already in place (no action needed)

V5.2 T2 commit `e7f9417`:

- `proveV5` length guard relaxed from `=== 14` to allowlist
  `[14, 19, 22]` via `ALLOWED_PUBLIC_SIGNAL_LENGTHS` (named constant)
  in `packages/sdk/src/prover/index.ts:150-151`.
- Regression test pinned at
  `packages/sdk/src/prover/index.test.ts` (or equivalent) asserting all
  three lengths are admitted and a 16-signal V4-leakage case is rejected.

This task closes by documenting *why* the v5-flow assertion didn't catch
the regression. The 1-line root cause + learning are above; the fix
itself is untouched.

## Cross-reference for #51 sweep

The methodology I'd apply to other Playwright specs (per task #51):

- For each `getByTestId` / `getByText` / `getByRole` assertion in
  `tests/e2e/*.spec.ts`, locate the rendering site in `src/`. If the
  element is gated on a state machine (`{condition && <element/>}`),
  the assertion correctly fails when the condition is false — no risk.
- HIGH-risk patterns are: testids attached to wrapping `<div>`s that
  always render, fuzzy `getByText` regexes that match substrings of
  unrelated copy, or `getByRole('alert')` assertions that match the
  *wrong* alert (e.g., the pipeline-error inline-alert vs. the
  intended skipped-state status).
- This file's analysis indicates v5-flow.spec.ts:103-118 is **LOW
  risk on the assertion-shape axis** and HIGH risk on the run-time-gate
  axis — the same shape applies to every spec in the suite. The first
  recommendation is therefore "fix the run-time gate" rather than
  "audit per-spec assertion shape."
