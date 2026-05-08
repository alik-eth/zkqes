# V5.6 — Unified `register` + atomic `registerWithAge` — implementation plan

> **Spec:** `docs/superpowers/specs/2026-05-08-v5_6-lost-wallet-recovery-amendment.md` (v0.2).
> **Branch:** `feat/v5_6` off `main`.
> **Scope:** contracts, contracts-sdk, sdk, web. Single-stream plan
> (no orchestration split — solo implementation).
> **Out of scope:** circuits (no change), ceremony, flattener, QTSP
> data, mock-qtsps fleet.
> **Deploy target:** Base Sepolia first, behind the same flow used for
> V5.4. Mainnet gated on Phase-B ceremony as before (unaffected by V5.6).

## Pre-flight (T0)

- [ ] Confirm spec v0.2 read end-to-end. Open questions resolved or
      explicitly punted (entry-point name → `registerWithAge`;
      notification surface → frontend follow-up; per-deployment
      opt-in → deferred; rebind-across-revoked → out of scope).
- [ ] Branch `feat/v5_6` from current `main` HEAD.
- [ ] Snapshot V5.4 baseline gas: `forge snapshot --snap snapshots/gas-snapshot.v5_4.txt`
      so the V5.6 ±5% budget check has a frozen reference.

## Phase A — contracts (TDD)

### A1. Test scaffolding for unified `register`

- [ ] Add tests to `packages/contracts/test/ZKQESRegistryUA.register.t.sol`:
  - [ ] `test_firstClaim_writesAllFields_emitsRegistered` (reuses V5.4 happy-path scaffolding).
  - [ ] `test_rebind_sameIdentity_swapsPk_emitsRebound` — RED at this point.
  - [ ] `test_rebind_sameWallet_idempotent_noEvent`.
  - [ ] `test_rebind_refreshesCtxAndDob`.
  - [ ] `test_rebind_preservesAgeProvenCutoffs`.
  - [ ] `test_revert_revokedBinding_rebind`.
  - [ ] `test_revert_modeNotRegister` (proof with `rotationMode != 0` → `WrongMode`).
  - [ ] `test_revert_firstClaim_nullifierAlreadyUsed_crossIdentity`.
- [ ] Run `forge test --match-path '*ZKQESRegistryUA.register*'` → expect Rebound tests RED.

### A2. Unified `register` implementation

- [ ] Edit `packages/contracts/src/ZKQESRegistryUA.sol`:
  - [ ] Drop `WalletNotBound` from the repeat-claim branch.
  - [ ] Replace Gate 5 body with the v0.2 first-claim/rebind branching
        per spec §"Gate sequence". Nullifier `usedNullifiers` write
        ONLY on first-claim; rebind leaves `b.nullifier` and
        `usedNullifiers` untouched.
  - [ ] Refresh `ctxHash`, `policyLeafHash`, `timestamp`, `dobCommit`,
        `dobSupported` on every call (first-claim and rebind both).
  - [ ] Emit `BindingRebound(id, oldPk, newPk)` only when
        `oldPk != address(0) && oldPk != msg.sender`.
  - [ ] Emit `BindingRegistered` only on first-claim (consistent with
        V5.4; relying parties already filter on it).
- [ ] Add `event BindingRebound(bytes32 indexed id, address indexed oldPk, address indexed newPk);` to interface + impl.
- [ ] Run A1 suite → all GREEN.

### A3. Delete `rotateWallet` surface

- [ ] Remove `rotateWallet()` from `ZKQESRegistryUA.sol` and
      `IZKQESRegistry.sol`.
- [ ] Remove `BindingRotated`, `InvalidRotationAuth`, `WalletNotBound`,
      `_rotateAuthSig`, `zkqes-rotate-auth-v1` constants.
- [ ] Delete `packages/contracts/test/ZKQESRegistryUA.rotateWallet.t.sol`
      entirely.
- [ ] `forge build` → clean.

### A4. `registerWithAge` test scaffolding (TDD)

- [ ] New file `packages/contracts/test/ZKQESRegistryUA.registerWithAge.t.sol`:
  - [ ] `test_happyPath_atomic_register_and_proveAge`.
  - [ ] `test_revert_registerFails_revertsAge` (bad register proof →
        whole tx reverts; assert no `ageProvenCutoffs` slot written).
  - [ ] `test_revert_ageFails_revertsRegister` (bad age proof →
        whole tx reverts; assert no `bindings[id].pk` written).
  - [ ] `test_rebindWithAge_succeeds` (existing binding from prior
        wallet; new wallet calls registerWithAge; both rebind + age
        succeed).
  - [ ] `test_revert_ageCutoffArgMismatch` → `BadAgeCutoff`.
  - [ ] `test_gas_within_register_plus_proveAge_plus_5pct`.
- [ ] Run → expect all RED (function doesn't exist).

### A5. `registerWithAge` implementation

- [ ] Add to `ZKQESRegistryUA.sol`:
  ```solidity
  function registerWithAge(
      /* register() args ... */
      uint256 ageCutoffDate,
      AgeProof calldata ageProof
  ) external returns (bytes32 bindingId, bool ageOk) {
      bindingId = register(/* ... */);
      ageOk = proveAge(bindingId, ageCutoffDate, ageProof);
  }
  ```
  Both `register` and `proveAge` retain their existing public ABIs;
  this is purely a thin transactional wrapper. Reverts in either
  inner call propagate as-is (no try/catch).
- [ ] Mirror signature in `IZKQESRegistry.sol`.
- [ ] Run A4 suite → all GREEN.

### A6. Gas snapshot

- [ ] `forge snapshot --snap packages/contracts/snapshots/gas-snapshot.txt`.
- [ ] Diff against `snapshots/gas-snapshot.v5_4.txt`:
  - `register`: must be within ±5%.
  - `registerWithAge`: must be ≤ `register + proveAge + 10k`.
- [ ] If `register` regresses >5%, investigate — should be near-zero
      delta (one extra branch on a hot path that was already paying for
      the SLOAD of `b.pk`).

### A7. Deploy script

- [ ] New file `packages/contracts/script/DeployV5_6UA.s.sol`:
  - [ ] Deploy fresh Poseidon T3 + T7 (or reuse existing ones; check
        if V5.4's libs are address-equivalent — they should be).
  - [ ] Deploy `ZKQESRegistryUA` (V5.6 bytecode).
  - [ ] Deploy `ZKQESCertificateUA` pointing at the new registry.
  - [ ] Wire trustedListRoot + policyRoot via env (re-use V5.4
        production values from `fixtures/contracts/base-sepolia.json`).
- [ ] Anvil dry-run.
- [ ] Sepolia broadcast (later, post-Phase B).

## Phase B — contracts-sdk

### B1. Drop `VerifiedUkrainian` rotation refs (none expected)

- [ ] Grep `packages/contracts-sdk/src/` for `rotate` — confirm
      nothing references `rotateWallet`. (V5.4 cert NFT didn't.)

### B2. `IZKQESRegistryUA.sol` interface update

- [ ] Edit `packages/contracts-sdk/src/IZKQESRegistryUA.sol`:
  - [ ] Add `registerWithAge` signature (return shape `(bytes32, bool)`).
  - [ ] Add `event BindingRebound(...)`.
  - [ ] Remove `rotateWallet`, `BindingRotated`, related errors.
- [ ] `forge build` to confirm cert NFT still resolves the interface.

## Phase C — sdk (TypeScript)

### C1. ABI pump

- [ ] Run `forge build` to refresh `packages/contracts/out/ZKQESRegistryUA.sol/ZKQESRegistryUA.json`.
- [ ] Regenerate `packages/sdk/src/abi/ZkqesRegistryUA.ts` from the
      forge output (replace contents wholesale; this is a generated
      file).
- [ ] No update needed for `ZKQESCertificateUA.ts` (mint surface
      unchanged).

### C2. Drop V5.4 rotation helpers from SDK

- [ ] Grep `packages/sdk/src/` for `rotateWallet`, `rotateAuth`,
      `qkb-rotate-auth-v1`, `zkqes-rotate-auth-v1`. Delete:
  - [ ] Any `encodeRotateWalletCalldata`, `RotationAuthArgs` types.
  - [ ] `computeRotationAuthHash` if exposed.
  - [ ] `rotationAuthHash.test.ts` (per `packages/web/CLAUDE.md` §10
        — invariant 10 about new-wallet locking is also obsolete).
- [ ] Update `packages/sdk/src/registry/registryV5_2.ts` (or wherever
      V5.4 register helpers live) to add a sibling
      `encodeRegisterWithAgeCalldata` returning the encoded calldata
      for the new function.

### C3. Type tests

- [ ] `pnpm -F @zkqes/sdk typecheck && pnpm -F @zkqes/sdk test`.

## Phase D — web

### D1. Delete `/account/rotate`

- [ ] `git rm -r packages/web/src/routes/account/rotate.tsx` (or
      whatever the actual file/dir is — locate via
      `grep -rn 'account/rotate' packages/web/src/`).
- [ ] Remove the route from `packages/web/src/router.tsx`.
- [ ] Remove the route from any nav menus, breadcrumbs, hero CTAs.
- [ ] Remove `useRotateWallet` hook + tests.
- [ ] Update `packages/web/CLAUDE.md`:
  - [ ] Drop invariant §10 (newWalletAddress locking).
  - [ ] Note the V5.6 unified-register policy.

### D2. Update Step 4 to call unified register

- [ ] `Step4ProveAndRegister.tsx`: behavior already calls
      `register()`. Add:
  - [ ] Pre-flight read: query
        `bindings(keccak(country, fingerprint))` to detect "rebind"
        case (binding exists, b.pk != connected wallet).
  - [ ] If rebind, surface a friendly notice: "We found an existing
        binding for this identity registered to a different wallet.
        Submitting will rebind it to **this** wallet." Confirm-button
        copy: `▶ Rebind to this wallet`.
  - [ ] Otherwise, default register copy: `▶ Register identity`.
  - [ ] Watch for `BindingRebound` event in
        `useWaitForTransactionReceipt` post-mine; if present, show a
        "rebind successful" toast distinct from first-claim.

### D3. Atomic `registerWithAge` on opt-in

- [ ] If user has the age-proof checkbox checked AND the binding's
      `dobSupported` is true (or, for first-claim, the proof carries
      a DOB), use `registerWithAge` instead of register + proveAge.
- [ ] One wallet prompt instead of two. Three tx hashes drop to two
      (registerWithAge + cert mint).
- [ ] Update progress copy: "Registering identity & proving age (1
      tx)…"

### D4. Update bindings hook

- [ ] `useV5_4BindingsForWallet.ts` — rename to
      `useV5_6BindingsForWallet.ts` (or just `useBindingsForWallet`).
  - [ ] Listen for `BindingRebound` events to keep wallet→bindingId
        cache fresh when a user rebinds away from a wallet they're
        currently watching.
  - [ ] On rebind detection (oldPk == watched wallet), invalidate the
        cache entry — that wallet no longer owns the binding.

### D5. i18n updates

- [ ] Add new keys to `packages/web/src/i18n/{en,uk}.json` (parity-
      gated):
  - `step4.rebindNotice`, `step4.rebindButton`, `step4.rebindSuccess`,
    `step4.atomicRegisterAge`.
- [ ] Remove rotation-flow keys (`account.rotate.*`).

### D6. Web tests

- [ ] Update `Step4ProveAndRegister.test.tsx` for the rebind branch.
- [ ] New test: `Step4ProveAndRegister.atomicAge.test.tsx` —
      registerWithAge call path.
- [ ] Delete rotation-flow tests under
      `packages/web/tests/unit/rotation*` and
      `packages/web/tests/e2e/account-rotate.spec.ts`.
- [ ] `pnpm -F @zkqes/web test && pnpm -F @zkqes/web typecheck`.

## Phase E — deploy + smoke

### E1. Sepolia deploy

- [ ] Deploy V5.6 stack via `DeployV5_6UA.s.sol`:
  ```bash
  forge script packages/contracts/script/DeployV5_6UA.s.sol \
    --rpc-url $BASE_SEPOLIA_RPC_URL \
    --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY -vv
  ```
- [ ] Pump addresses to `fixtures/contracts/base-sepolia.json` under
      a new `v5_6` block (mirror v5_4 shape; certificate address
      gets a fresh deploy because it pins the registry in its
      constructor).
- [ ] Update `packages/sdk/src/deployments.ts` to expose
      `ZKQES_REGISTRY_UA_V5_6` alongside the V5.4 entry (keep V5.4
      for dual-lookup during migration).

### E2. Live smoke

- [ ] First-claim register against live Sepolia from a fresh wallet
      with a real Diia .p7s — confirm tx success + `BindingRegistered`
      event.
- [ ] Rebind: switch wallets, run register again with the same .p7s
      — confirm tx success + `BindingRebound` event with correct
      `oldPk`, `newPk`.
- [ ] Atomic `registerWithAge` from another fresh wallet — confirm
      both gates pass in one tx, both events emitted.
- [ ] Cert NFT mint against the new registry — confirm
      `onlyVerifiedUkrainian` modifier works against V5.6 binding.

### E3. Fly redeploy

- [ ] `fly deploy --config packages/web/fly.toml --dockerfile packages/web/Dockerfile`.
- [ ] Smoke at `https://zkqes-app.fly.dev/`: full flow end-to-end.

## Phase F — cleanup + docs

- [ ] Update `CLAUDE.md` (repo root) §"Phase status snapshot":
  ```text
  - **V5.6 unified register** — shipped on Base Sepolia at
    <address>, tag v0.6.x-v5_6. rotateWallet removed; rebind via
    register; registerWithAge atomic.
  ```
- [ ] Update `packages/contracts/CLAUDE.md`:
  - [ ] Drop §14.x rotation references where they exist.
  - [ ] Add a §15 "V5.6" subsection mirroring §14 V5 conventions.
- [ ] Update `packages/web/CLAUDE.md`:
  - [ ] Delete invariant §10 (newWalletAddress locking; obsolete).
  - [ ] Note V5.6 unified-register pattern in the Phase-handoffs section.
- [ ] Update `packages/sdk/src/deployments.ts` JSDoc to reference the
      V5.6 spec instead of "V5.4 redesign vs V5.2."
- [ ] Tag commit `v0.6.0-v5_6` once Sepolia smoke passes.

## Risk register

- **R1: Existing V5.4 bindings on Sepolia don't auto-migrate.** Users
  who care must re-register on V5.6. Mitigated by dual-lookup in the
  web app during the migration window.
- **R2: Hijack-via-stolen-QES window.** Per spec §"Threat model
  rebalance," accepted as equivalent to off-chain QES theft exposure.
  No technical mitigation in v0.2; admin `setRevoked` remains the
  emergency response.
- **R3: Cert NFT replay across registries.** Cert NFT pins the V5.6
  registry in its constructor; minted tokens reference V5.6 bindings
  only. V5.4 cert NFT continues to reference V5.4 bindings. Two
  separate token universes during migration; documented in
  user-facing copy.
- **R4: Gas regression on `register`.** Mitigated by the A6 ±5%
  snapshot check.
- **R5: SDK/web typecheck cascade from removed rotation symbols.**
  Likely surfaces in C2 + D1; expect 30-60 minutes of fixup.

## Done criteria

- [ ] All forge tests green; gas snapshot within bounds.
- [ ] `pnpm -F @zkqes/sdk test && pnpm -F @zkqes/web test` green.
- [ ] V5.6 deployed on Base Sepolia; addresses pumped to fixtures.
- [ ] Live smoke (first-claim + rebind + registerWithAge + cert mint)
      all pass.
- [ ] Fly app redeployed; full flow works end-to-end at
      `zkqes-app.fly.dev`.
- [ ] `feat/v5_6` merged to `main` with `--no-ff` summary commit.
- [ ] Tag `v0.6.0-v5_6` pushed.
