# V5.6 — Unified `register` (no rotation) + atomic register+age

> **Status:** v0.2 — design draft, no implementation. Pre-T0 (no plan, no
> dispatch). Drafted 2026-05-08; awaiting founder signoff before
> writing `docs/superpowers/plans/`.
>
> **Date:** 2026-05-08.
>
> **Amends:** `packages/contracts/src/ZKQESRegistryUA.sol` and
> `IZKQESRegistry.sol`. Circuit unchanged. Public-signal layout
> unchanged. Ceremony unchanged. Storage layout changes (fresh deploy).
>
> **Predecessor work (READ FIRST):**
> - V5.4 contract: `packages/contracts/src/ZKQESRegistryUA.sol`
> - V5.4 IZKQESRegistry: `packages/contracts/src/IZKQESRegistry.sol`
> - V5.1 wallet-bound nullifier: `docs/superpowers/specs/2026-04-30-wallet-bound-nullifier-amendment.md`
> - V5.2 keccak-on-chain: `docs/superpowers/specs/2026-05-01-keccak-on-chain-amendment.md`
> - V5.3 OID anchor: `docs/superpowers/specs/2026-05-03-v5_3-oid-anchor-amendment.md`
> - V5.5 multi-algorithm (parallel track): `docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md`
> - v0.1 of this spec (rotation-based recovery, **superseded**) at git
>   `bc90ff2` if context is needed for the design pivot.

## TL;DR

Replace V5.4's two-entry-point `register()` + `rotateWallet()` model
with a single `register()` that handles first-claim, wallet swap, and
lost-wallet recovery in one path:

```text
register(proof, …) → bindingId
  if !exists(bindingId): create binding, write nullifier (write-once),
                         set b.pk = msg.sender
  if  exists && !revoked: overwrite b.pk = msg.sender,
                         refresh ctxHash / policyLeafHash / timestamp /
                         dobCommit / dobSupported, nullifier unchanged
```

Authorization is "fresh valid proof for the same `identityFingerprint`."
`bindingId = keccak(country, identityFingerprint)` already commits the
fingerprint, so no new storage slot is needed.

Add a sibling entry point `registerWithAge(...)` that performs the
same `register()` work plus an `proveAge()` in a single atomic tx —
the common "register and prove ≥18yo at the same time" path drops from
two transactions to one, halving wallet-prompt friction.

`rotateWallet()` and the entire `zkqes-rotate-auth-v1` payload are
removed. The circuit's `rotationMode` / `rotationNewWallet` /
`rotationOldCommitment` public signals stay frozen in the layout
(circuit unchanged) but are ignored on-chain.

## Goals

1. **Restore lost-wallet recovery** for honest users who control the
   QES key but have lost the wallet's private key.
2. **Collapse the auth surface.** One state-mutating identity entry
   point (`register`) plus its bundled-with-age sibling
   (`registerWithAge`). Easier to audit, easier to document, fewer
   gates to drift across.
3. **Atomic register-and-age.** UA's reference flow today registers in
   one tx and proves age in a second. The two-tx friction is the most
   user-visible cost of the V5.4 design; folding them is a pure UX win
   with no security trade-off (both proofs are independently verified
   by the same gates).
4. **Match the off-chain trust model.** The QTSP is the ultimate
   authority on QES validity (revocation/reissuance). On-chain auth
   should not impose a stricter model than off-chain QES already does.
5. **No circuit change.** No ceremony reroll. The 22-signal V5.4 leaf
   proof is reused byte-identically; same V5.4 verifier contracts.
6. **Admin escape hatch preserved.** `setRevoked(bindingId, true)`
   remains terminal and admin-only — the QTSP-driven panic switch.

## Non-goals

- **No new public signals.** Recovery + register reuse the existing
  V5.4 22-signal proof.
- **No timelock.** v0.2 is the instant-rebind shape. Discussion in
  v0.1 §"Alternative considered: timelock" carries over verbatim;
  rationale unchanged.
- **No QTSP revocation feed.** Admin `setRevoked` remains the response
  to a known QES compromise.
- **No per-binding opt-out.** A future amendment may flag specific
  high-value bindings as "rotation requires admin co-sign"; v0.2 does
  not include that complexity.

## Background — the lost-wallet trap (unchanged from v0.1)

V5.4 keys bindings on `keccak(country, identityFingerprint)`. The
fingerprint is rotation-stable (depends only on QES
`subject.serialNumber` per V5.3 §F1). Repeat-registration from a
different wallet hits `WalletNotBound`; `rotateWallet()` requires an
old-wallet ECDSA sig that a lost-wallet user cannot produce.

Net result in V5.4: lost wallet ⇒ permanent on-chain identity loss for
that country. No user-facing recovery path. v0.2 closes this by
relaxing `register`'s repeat-claim gate to accept the proof itself as
authorization (the proof carries the fingerprint; same identity ⇒
same `bindingId`).

## Threat model rebalance (refined from v0.1)

The relaxed model accepts: **QES key compromise = on-chain hijack
possible.** v0.1 considered this acceptable on the grounds that QES
theft is already off-chain catastrophic (loans, banking, notarization
under eIDAS Art. 25). v0.2 inherits that argument unchanged. Mitigations:

- `BindingRebound` event surfaces every wallet swap; victim detects
  via frontend notification (a registered email/push channel — out of
  scope for the contract amendment, flagged as a frontend follow-up).
- Victim contacts QTSP, requests cert revocation.
- Admin `setRevoked(bindingId, true)` kills the binding terminally.
- Nullifier write-once means a hijacker cannot mint a fresh
  identity-anchored proof of personhood under the victim's binding —
  the original first-claim's nullifier is what's tied to the
  identity, and it doesn't change on rebind.

The window between attack and admin-revoke is the residual exposure.
v0.2 accepts this as equivalent to the off-chain residual exposure
between QES theft and QTSP cert revocation.

**What v0.2 loses vs. V5.4's `rotateWallet`:** the old-wallet ECDSA
sig requirement defended against a stolen-proof + new-wallet attacker
attempting to rotate (they'd lack the old-wallet sig). v0.2 doesn't
have that gate. Per the spec's own threat-model section, the delta
this defended (a stolen proof but unstolen old wallet) doesn't have
an off-chain analog and isn't load-bearing.

## Design

### Entry point 1: unified `register`

```solidity
/// @notice Register or recover a binding for the calling wallet.
///         First-claim creates the binding; repeat-claim with a fresh
///         valid proof for the same identity rebinds it to msg.sender.
///         No separate rotation entry point exists.
///
/// @dev    bindingId = keccak256(abi.encode(COUNTRY, leafProof.identityFingerprint)).
///         The caller passes the proof + supporting calldata; gates 1-4
///         match V5.4 register exactly. Gate 5 is the relaxed repeat-
///         claim branch (see "Gate sequence" below).
function register(
    ChainProof  calldata chainProof,
    LeafProof   calldata leafProof,
    bytes       calldata leafSpki,
    bytes       calldata intSpki,
    bytes       calldata signedAttrs,
    bytes32[2]  calldata leafSig,
    bytes32[2]  calldata intSig,
    bytes32[16] calldata trustMerklePath,
    uint256              trustMerklePathBits,
    bytes32[16] calldata policyMerklePath,
    uint256              policyMerklePathBits
) external returns (bytes32 bindingId);
```

ABI is **unchanged from V5.4 register**. The behavior change is
internal: Gate 5's repeat-claim branch no longer reverts
`WalletNotBound`.

### Entry point 2: atomic `registerWithAge`

```solidity
/// @notice Atomic register + age-proof in one tx. Useful for the
///         common UA flow where a user binds and proves ≥18yo from
///         the same .p7s in a single wallet prompt.
///
/// @dev    Internally runs the full register() pipeline, then the
///         full proveAge() pipeline. Either gate failure reverts the
///         entire tx (no partial state). Same authorization rules as
///         the two functions called separately; this is purely a
///         transaction-level convenience.
///
///         `ageCutoffDate` MUST equal `ageProof.ageCutoffDate` per
///         V5.4 proveAge spec §3.4 (cross-bind), 19000101..99991231.
function registerWithAge(
    /* register() args */
    ChainProof  calldata chainProof,
    LeafProof   calldata leafProof,
    bytes       calldata leafSpki,
    bytes       calldata intSpki,
    bytes       calldata signedAttrs,
    bytes32[2]  calldata leafSig,
    bytes32[2]  calldata intSig,
    bytes32[16] calldata trustMerklePath,
    uint256              trustMerklePathBits,
    bytes32[16] calldata policyMerklePath,
    uint256              policyMerklePathBits,
    /* proveAge() args */
    uint256              ageCutoffDate,
    AgeProof    calldata ageProof
) external returns (bytes32 bindingId, bool ageOk);
```

Returns the bindingId from register and the `ok` flag from proveAge
(currently always `true` since proveAge reverts on any failure;
keeping the symmetric return shape so a future relaxation doesn't
break callers).

### Gate sequence — `register()` v0.2

Gates 1-4 unchanged from V5.4. Only Gate 5 changes.

| # | Gate | Check | Errors |
|---|---|---|---|
| 1 | Mode | `leafProof.rotationMode == 0` (register mode; rotation mode rejected at this entry point) | `WrongMode` |
| 2 | ChainProof bind | `leafProof.leafSpkiCommit / intSpkiCommit / signedAttrs hashes` match calldata | `BadLeafSpki`, `BadIntSpki`, `BadSignedAttrsHi/Lo` |
| 3 | Groth16 | identity verifier accepts proof + 22 public signals | `BadProof` |
| 4 | Trust + Policy + Sender | trust-Merkle root, policy-Merkle root, msg.sender keccak match, timestamp freshness | `BadTrustList`, `BadPolicy`, `BadSender`, `StaleBinding`, `FutureBinding` |
| 5 | Rebind | see below | `BindingRevoked`, `NullifierUsed` |

**Gate 5 — rebind branch (the v0.2 change):**

```solidity
bytes32 bindingId = keccak256(abi.encode(COUNTRY, leafProof.identityFingerprint));
Binding storage b = bindings[bindingId];

if (b.pk == address(0)) {
    // First-claim: write all fields including nullifier (write-once).
    if (usedNullifiers[bytes32(leafProof.nullifier)]) revert NullifierUsed();
    usedNullifiers[bytes32(leafProof.nullifier)] = true;
    b.nullifier = leafProof.nullifier;
    b.pk = msg.sender;
    b.ctxHash = leafProof.ctxHash;
    b.policyLeafHash = leafProof.policyLeafHash;
    b.timestamp = leafProof.timestamp;
    (b.dobCommit, b.dobSupported) = _extractDob(leafProof);
    emit BindingRegistered(bindingId, msg.sender, b.ctxHash);
} else {
    // Rebind: authorized by the proof itself (fingerprint is already
    // baked into bindingId, so a valid proof here means same identity).
    if (b.revoked) revert BindingRevoked();
    address oldPk = b.pk;
    b.pk = msg.sender;
    b.ctxHash = leafProof.ctxHash;
    b.policyLeafHash = leafProof.policyLeafHash;
    b.timestamp = leafProof.timestamp;
    (b.dobCommit, b.dobSupported) = _extractDob(leafProof);
    // nullifier intentionally NOT rewritten — first-claim's value is
    // load-bearing for V5.1 anti-Sybil and must remain stable.
    if (oldPk != msg.sender) emit BindingRebound(bindingId, oldPk, msg.sender);
}
```

`ageProvenCutoffs[bindingId][cutoffYmd]` is keyed by bindingId, not
wallet, and persists across rebinds — the underlying claim ("this
identity is older than X") is a property of the QES-anchored
identity, not the wallet that proved it.

### Removed surface

- `rotateWallet(bindingId, leafProof, newWallet, sig)` — deleted.
- `BindingRotated(bindingId, oldPk, newPk)` event — deleted.
- `zkqes-rotate-auth-v1` domain string + `_rotateAuthSig` helper —
  deleted from contract + SDK.
- `InvalidRotationAuth`, `WalletNotBound` errors — deleted.
- Frontend `/account/rotate` route — deleted (the recovery surface
  becomes "go to Step 1, upload your fresh .p7s, click Register").

### New surface

```solidity
event BindingRebound(
    bytes32 indexed id,
    address indexed oldPk,
    address indexed newPk
);

function registerWithAge(/* ... */) external returns (bytes32, bool);
```

(That's it. One event, one function. No new errors, no new mappings,
no struct changes.)

### Storage layout

`Binding` struct **unchanged** from V5.4. `identityFingerprint` stays
out of storage — it's already implicit in `bindingId =
keccak(country, fingerprint)`, and re-deriving on each rebind is
free (it comes from the proof's public signals).

This is a refinement over v0.1's design, which proposed adding
`Binding.identityFingerprint` as a stored slot. v0.2 doesn't need it:
the bindingId-derivation already binds the identity. v0.1's storage-
collision warning is therefore moot.

**However**, the `nullifier` field's write-once semantic on rebind is
new behavior the V5.4 deployed contract doesn't enforce, and adding
the rebind branch means the deployed bytecode must change. So v0.2 is
still a fresh deploy for code-change reasons, not storage-collision
reasons.

## Migration

V5.6 is a **fresh deploy** (`script/DeployV5_6UA.s.sol`).

- The V5.4 deployed registries (per `fixtures/contracts/*.json`)
  remain readable; relying parties dual-lookup against V5.4 + V5.6
  during the migration window.
- Holders re-register on V5.6 to gain wallet-recovery support.
  Re-registration is the **same flow** users already do — no special
  migration wizard, just visit the app and submit a fresh .p7s.
- SDK pumps a new ABI + new deployment address per the standard pump
  flow (`fixtures/contracts/<chain>.json` → web worker tree).
- Frontend: delete `/account/rotate`, update Step 4 to use the
  unified register (no behavior change for first-time users), add a
  "rebind to this wallet" affordance for users whose proof
  fingerprint matches an existing binding under a different wallet.

## Test plan

Per-package per `packages/contracts/CLAUDE.md` §7 conventions — every
external function gets a happy path + at least one revert test.

`test/ZKQESRegistryUA.register.t.sol` (extended):

| Test | Asserts |
|---|---|
| `test_firstClaim_writesAllFields_emitsRegistered` | binding created, nullifier written, all fields populated, BindingRegistered emitted |
| `test_rebind_sameIdentity_swapsPk_emitsRebound` | rebind from a different wallet succeeds; b.pk = new msg.sender; nullifier untouched; BindingRebound emitted |
| `test_rebind_sameWallet_idempotent` | re-running register from current b.pk wallet succeeds; no Rebound event (guard on oldPk != msg.sender); fields refresh |
| `test_rebind_refreshesCtxAndDob` | new proof's ctxHash, policyLeafHash, timestamp, dobCommit visible post-rebind |
| `test_rebind_preservesAgeProvenCutoffs` | proveAge cutoffs set pre-rebind survive the rebind |
| `test_revert_revokedBinding_rebind` | admin-revoked binding → BindingRevoked on rebind attempt |
| `test_revert_firstClaim_nullifierAlreadyUsed` | first-claim with a nullifier already registered under a different bindingId reverts NullifierUsed (anti-cross-identity-replay) |
| `test_revert_modeNotRegister` | rotationMode != 0 → WrongMode (rotation mode is no longer accepted) |
| (existing V5.4 register tests) | trust-list, policy, sender, timing, proof tampering — all carry over |

`test/ZKQESRegistryUA.registerWithAge.t.sol` (new):

| Test | Asserts |
|---|---|
| `test_happyPath_atomic_register_and_proveAge` | both pipelines succeed; binding created, ageProvenCutoffs[id][cutoff] = true; both events emitted |
| `test_revert_registerFails_revertsAge` | bad register proof → entire tx reverts; no age-side state |
| `test_revert_ageFails_revertsRegister` | bad age proof → entire tx reverts; no register-side state |
| `test_rebindWithAge_succeeds` | call registerWithAge against an existing binding from a new wallet; rebind + new age cutoff both apply |
| `test_revert_ageCutoffArgMismatch` | ageCutoffDate arg ≠ ageProof.ageCutoffDate → BadAgeCutoff |
| `test_gas_budget_within_register_plus_proveAge_plus_5pct` | gas ≤ (register gas + proveAge gas) × 1.05 |

Plus delete:

- All `test/ZKQESRegistryUA.rotateWallet.t.sol` tests.
- `test/ZKQESRegistryUA.rotateWalletByProof.t.sol` (proposed in v0.1).

Gas budget: `register` v0.2 should be within ±5% of V5.4 baseline (one
extra branch + one stable storage write on rebind). `registerWithAge`
≈ register gas + proveAge gas + ~10k overhead. Refresh
`snapshots/gas-snapshot.txt` post-implementation.

## Phase status snapshot delta (for repo CLAUDE.md)

Add to the §"Phase status snapshot" section:

- **V5.6 unified register** — design draft v0.2 2026-05-08
  (`docs/superpowers/specs/2026-05-08-v5_6-lost-wallet-recovery-amendment.md`).
  Pre-T0; awaiting founder signoff before plan-writing.

## Open questions

- **`registerWithAge` entry-point name.** Alternatives: `register`
  with a tagged variant struct (overloading-by-arity is ugly in
  Solidity); `registerAndProveAge`; `bind`; `claim`. Default
  `registerWithAge` for symmetry with `proveAge`. Open to a better
  name if one comes up.
- **Notification surface for `BindingRebound`.** Frontend follow-up.
  Default registration flow could optionally collect an email/push
  endpoint (encrypted, off-chain); on Rebound events the indexer
  notifies. Out of scope for the contract amendment.
- **Per-deployment opt-in for instant-rebind.** Should a high-value
  registry be able to opt out of unified-register and require an
  admin co-sign for repeat-claim? Adds complexity; defer unless a
  deployment requests it.
- **Rebind-across-revoked.** Currently a revoked binding cannot be
  rebound. This is intentional (admin terminal kill) but means a
  user whose binding was admin-revoked due to suspected QES
  compromise must wait for QTSP cert reissuance with a *new*
  fingerprint before re-registering. Document this clearly in the
  user-facing recovery copy.
