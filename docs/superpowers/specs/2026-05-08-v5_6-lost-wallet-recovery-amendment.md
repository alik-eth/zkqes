# V5.6 — Lost-wallet recovery via QES-only rotation (rotateWallet auth widening)

> **Status:** v0.1 — design draft, no implementation. Pre-T0 (no plan, no
> dispatch). Discussed in-session 2026-05-08; awaiting founder signoff
> before drafting `docs/superpowers/plans/`.
>
> **Date:** 2026-05-08.
>
> **Amends:** `packages/contracts/src/ZKQESRegistryUA.sol` — `rotateWallet()`
> only. Circuit unchanged. Public-signal layout unchanged. SDK ABI
> additive (new optional auth-mode argument). All V5/V5.1/V5.2/V5.3/V5.4
> invariants preserved.
>
> **Predecessor work (READ FIRST):**
> - V5.4 contract: `packages/contracts/src/ZKQESRegistryUA.sol`
> - V5.4 IZKQESRegistry: `packages/contracts/src/IZKQESRegistry.sol`
> - V5.1 wallet-bound nullifier: `docs/superpowers/specs/2026-04-30-wallet-bound-nullifier-amendment.md`
> - V5.2 keccak-on-chain: `docs/superpowers/specs/2026-05-01-keccak-on-chain-amendment.md`
> - V5.3 OID anchor: `docs/superpowers/specs/2026-05-03-v5_3-oid-anchor-amendment.md`
> - V5.5 multi-algorithm (parallel track): `docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md`

## TL;DR

Add a second authorization path to `rotateWallet`: in addition to the
current old-wallet ECDSA signature, accept a **fresh leaf proof for the
same `identityFingerprint`** as sufficient authorization to swap
`bindings[bindingId].pk` to a new wallet. Closes the lost-wallet trap
without raising the bar for QES-key theft (which is already
catastrophic off-chain via banking/loans/notarization, so on-chain
parity does not enlarge the attacker's capabilities).

Public-signal layout, circuit, ceremony all unchanged. One new external
function (`rotateWalletByProof`) plus one event. Two-week dev + audit
window; ships independently of V5.5.

## Goals

1. **Restore lost-wallet recovery** for honest users who control the
   QES key but have lost the wallet's private key.
2. **Preserve the no-instant-hijack property** post-registration: a
   stolen proof + new wallet alone must NOT be sufficient to silently
   swap an active binding.
3. **Match the off-chain trust model**: the QTSP is the ultimate
   authority on QES validity (revocation/reissuance). The on-chain
   registry should not impose a stricter authorization model than the
   off-chain QES itself does.
4. **No circuit change.** No ceremony reroll. No SDK ABI break for
   existing `rotateWallet` callers.
5. **Admin escape hatch preserved.** `setRevoked(bindingId, true)`
   remains terminal and admin-only — the QTSP-driven panic switch.

## Non-goals

- **No new public signals.** Recovery uses the existing 22-signal V5.4
  proof.
- **No re-architecture of `register()`.** The QES-key-theft hijack at
  *first registration* (race-to-claim) is a separate problem; this
  amendment does not address it. See §"Open vectors not addressed."
- **No timelock.** v0.1 is the instant-recovery shape. A timelocked
  variant is sketched in §"Alternative considered: timelock" for
  comparison; v0.1 deliberately does not adopt it (rationale below).
- **No QTSP revocation feed.** A future amendment may consume an
  oracle-fed revocation list to auto-revoke bindings tied to revoked
  certs; this amendment relies on admin `setRevoked` for that role.

## Background — the lost-wallet trap

V5.4 `register()` keys bindings on `keccak(country, identityFingerprint)`,
where `identityFingerprint` is rotation-stable (depends only on the QES
`subject.serialNumber`). Repeat-registration from a different wallet
hits the repeat-claim branch (`b.pk != msg.sender → revert
WalletNotBound`).

`rotateWallet()` is the only path to swap `b.pk`, and it requires an
ECDSA signature from the **current** `b.pk` over the canonical
rotation payload (`zkqes-rotate-auth-v1 || chainid || registry ||
bindingId || newWallet`).

If a user loses the wallet's private key:

- `register()` reverts (`WalletNotBound`).
- `rotateWallet()` reverts (`InvalidRotationAuth` — no old-wallet sig).
- `setRevoked()` is admin-only and terminal (revoked bindings cannot
  be re-claimed: repeat-claim checks `b.revoked` before
  `b.pk != msg.sender`).
- New QES cert from the QTSP keeps the same `subject.serialNumber` per
  ETSI EN 319 412-1 §5.1.3, so produces the same `bindingId`.

Net result: lost wallet ⇒ permanent on-chain identity loss for that
country. No user-facing recovery path exists in V5.4.

## Threat model rebalance

The V5.4 `rotateWallet` design defends primarily against **proof
replay / forgery**. Adding the old-wallet signature gate also incidentally
defends against the *post-registration* QES-key-theft hijack:

- Attacker steals QES key.
- Attacker produces a proof for a wallet they control.
- Attacker calls `rotateWallet` — reverts because they don't have the
  old wallet's ECDSA sig.
- Binding stays with the honest user.

This second property is real but its security value is bounded by the
off-chain QES threat model. A compromised QES key can already, *off-
chain*:

- Sign QES-bound loan agreements (legally enforceable in EU
  jurisdictions per eIDAS Art. 25).
- Authorize bank-account openings and changes.
- Sign property transfers, notarized contracts, employment documents,
  tax filings.

The on-chain identity binding adds nothing the attacker doesn't
already have access to via these channels, *and* the off-chain
recourse (QTSP cert revocation, criminal complaint, civil dispute) is
strictly better-developed than the on-chain one.

So the security argument for "QES alone must not authorize on-chain
rotation" rests on a delta that, in practice, doesn't exist: a victim
of QES theft is already in maximum-loss territory. Forcing honest
lost-wallet users into permanent on-chain exclusion to defend against
an attack that's already devastating off-chain trades a real,
common-case UX failure for a marginal, edge-case security gain.

## Design

### New entry point

```solidity
/// @notice Rotate a binding's wallet pointer using a fresh QES proof
///         as authorization — recovery path for users who have lost
///         control of the binding's current wallet but retain the QES
///         key.
///
/// @dev    Distinct entry point from rotateWallet() to preserve gas
///         accounting clarity and to make the relaxed authorization
///         shape explicit at the call site (not buried in an
///         optional-arg branch). Both functions share the same
///         underlying state transition (b.pk = newWallet) and the
///         same downstream invariants (nullifier write-once,
///         ageProvenCutoffs persists).
///
///         Authorization: the supplied LeafProof's identityFingerprint
///         MUST equal the binding's identityFingerprint (already
///         stored, derived from QES subject.serialNumber per V5.3 §F1
///         OID-anchored extraction). The Groth16 verifier checks the
///         proof's structural validity; the fingerprint match
///         enforces "same identity that originally registered."
///
///         msg.sender becomes the new b.pk. No old-wallet sig
///         required. No timelock.
function rotateWalletByProof(
    bytes32         bindingId,
    LeafProof calldata leafProof,
    address         newWallet
) external;
```

### Gate sequence

1. **Mode gate**: `leafProof.rotationMode == 1` (same as `rotateWallet`).
2. **Range check**: `rotationNewWallet` fits in 160 bits (V5.3 F2,
   same as `rotateWallet`).
3. **Explicit-arg vs in-circuit-bound**: `uint160(newWallet) ==
   leafProof.rotationNewWallet` (same as `rotateWallet`).
4. **msg.sender == newWallet**: the caller is the recovery target.
   This prevents an attacker from rotating a victim's binding to a
   third party they don't control, narrowing the abuse surface to
   "attacker rotates to themselves" (which is what `rotateWallet`
   already permits when the attacker has the proof + old-wallet sig).
5. **Groth16 verify**: standard 22-signal gate.
6. **Lookup binding**:
   - `b.pk != address(0)` (binding exists)
   - `!b.revoked` (admin hasn't killed it)
   - `newWallet != b.pk` (it's actually a rotation)
   - `newWallet != address(0)` (sanity)
7. **Identity-fingerprint match**: the load-bearing recovery gate.
   `leafProof.identityFingerprint == b.identityFingerprint`. Requires
   adding `identityFingerprint` as a stored field on `Binding`
   (currently derivable only from a fresh proof — see §"Storage
   addition" below).
8. **State update**: `b.pk = newWallet`. Nullifier and other
   first-claim slots untouched.
9. **Event**: `BindingRecovered(bindingId, oldPk, newPk)`.

### Storage addition

`Binding` struct gains one slot:

```solidity
struct Binding {
    address pk;
    uint256 ctxHash;
    uint256 policyLeafHash;
    uint256 timestamp;
    uint256 dobCommit;
    uint256 dobSupported;
    bool    revoked;
    uint256 nullifier;
    uint256 identityFingerprint;  // NEW — V5.6
}
```

Written on first-claim path in `register()`; read in
`rotateWalletByProof()` Gate 7. The fingerprint is already a public
signal on every leaf proof, so no circuit change is needed; the
contract just persists what it already has access to.

**Storage layout warning**: this is a non-upgradeable additive change.
The V5.4 deployed registries (per `fixtures/contracts/*.json`) cannot
absorb the new slot without a fresh deploy. Per the V4 §13.8 + V5.1
Phase-2 storage warning, V5.6 is a fresh `DeployV5_6.s.sol` with a
holder re-registration migration. The migration cost is real and
should be weighed against waiting for V6 (where this consolidates with
multi-algorithm + any other accumulated breaking changes).

### New error + event

```solidity
error IdentityFingerprintMismatch();

event BindingRecovered(
    bytes32 indexed id,
    address indexed oldPk,
    address indexed newPk
);
```

`BindingRecovered` is a separate event from `BindingRotated` so
indexers + the future activity log can distinguish "old-wallet-
authorized rotation" from "QES-only recovery." Worth surfacing
because the latter has different operational semantics: a user who
sees `BindingRecovered` for their binding without initiating it has
been QES-key-compromised and should contact their QTSP for cert
revocation.

### Interface change

```solidity
// IZKQESRegistry.sol — additive
function rotateWalletByProof(
    bytes32         bindingId,
    LeafProof calldata,
    address         newWallet
) external;

event BindingRecovered(
    bytes32 indexed id,
    address indexed oldPk,
    address indexed newPk
);
```

No signature change to existing `rotateWallet()`. Existing SDK call
sites continue to work unchanged.

## Open vectors not addressed

### V1: race-to-claim at first registration

If an attacker compromises a QES key for an identity that has
**never registered** on this registry, they can call `register()` for
a wallet they control and own the binding. The honest user is then
blocked from registering and would need to use `rotateWalletByProof`
to recover (which works, post-V5.6). So V5.6 actually mitigates this
vector indirectly — pre-V5.6, a stolen-then-registered identity is
permanently lost; post-V5.6, the honest user can recover via the new
path.

This is the **primary security upgrade** of V5.6 alongside lost-
wallet recovery: it makes first-claim no longer terminal in the
adversarial case. Worth highlighting in the migration messaging.

### V2: silent QES theft + recovery

Attacker steals QES key, runs `rotateWalletByProof` to a wallet they
control, victim loses on-chain binding. Mitigations:
- `BindingRecovered` event surfaces the swap; victim can detect via
  email/push notification (frontend-side feature).
- Victim contacts QTSP, requests cert revocation.
- Admin `setRevoked(bindingId, true)` kills the binding.
- New QES cert from the QTSP would in principle generate a new
  `subject.serialNumber` *only if* the QTSP issues a new person-ID
  rather than re-using the prior one. Per ETSI EN 319 412-1 the
  person-ID is normally stable; this is a QTSP-policy question.

The window between attack and admin-revoke is the residual
exposure. v0.1 accepts this as equivalent to the off-chain residual
exposure between QES theft and QTSP cert revocation, which is the
established eIDAS recovery pattern.

### V3: stolen-wallet replay against `rotateWallet`

Unrelated to V5.6 — same as V5.4. The old-wallet sig is single-use
per `(chainid, registry, bindingId, newWallet)` tuple; replay across
bindings or chains is structurally blocked.

## Alternative considered: timelock

Earlier session draft proposed a 30-day timelocked recovery with a
challenge window for the old wallet to veto. Rejected for v0.1
because:

- The honest lost-wallet user is by construction unable to challenge
  during the window (they don't have the old key).
- The 30-day wait is a real UX failure for the actual common case.
- The attack it defends against (QES-key-theft + lost-wallet user is
  *also* watching events and has off-chain QTSP-revocation reach
  within 30 days) is a narrow slice that doesn't justify the
  always-on UX cost.
- Admin `setRevoked` already provides a slower, governance-mediated
  recovery for the rare case where the timelock would have helped.

A future amendment could add `rotateWalletByProofWithTimelock` as a
second flavor for risk-averse deployments (e.g. a high-value mainnet
registry where instant recovery is opt-out per binding). Out of
scope for V5.6.

## Test plan

Per-package per `packages/contracts/CLAUDE.md` §7 conventions — every
external function gets a happy path + at least one revert test.

`test/ZKQESRegistryUA.rotateWalletByProof.t.sol` (new file):

| Test | Asserts |
|---|---|
| `test_happyPath_lostWallet_swapsPk_emitsRecovered` | binding.pk swaps to newWallet; nullifier untouched; event with correct args |
| `test_revert_unknownBinding` | `b.pk == address(0)` → `UnknownIdentity` |
| `test_revert_revokedBinding` | admin-revoked binding → `BindingRevoked` |
| `test_revert_zeroNewWallet` | `newWallet == 0` → `InvalidNewWallet` |
| `test_revert_sameAsCurrentWallet` | `newWallet == b.pk` → `InvalidNewWallet` |
| `test_revert_msgSenderNotNewWallet` | `msg.sender != newWallet` → new error `RecoveryCallerMismatch` |
| `test_revert_fingerprintMismatch` | proof's fingerprint ≠ binding's stored fingerprint → `IdentityFingerprintMismatch` |
| `test_revert_modeNotRotation` | `rotationMode != 1` → `WrongMode` |
| `test_revert_rotationNewWalletRangeFail` | rotationNewWallet > 2^160 → `InvalidNewWallet` |
| `test_revert_argMismatch` | newWallet arg ≠ rotationNewWallet limb → `NewWalletArgMismatch` |
| `test_revert_badProof` | tampered Groth16 proof → `BadProof` |
| `test_repeatRecovery_succeeds_idempotent` | rotate to wallet B, then to wallet C; both succeed; nullifier still untouched |
| `test_recoveryAfterRotateWallet_succeeds` | use rotateWallet (sig-auth), then rotateWalletByProof from a fresh wallet — both auth paths interoperate |

Plus add to existing `test/ZKQESRegistryUA.register.t.sol`:

| Test | Asserts |
|---|---|
| `test_register_persistsIdentityFingerprint` | first-claim writes `b.identityFingerprint` matching the proof |
| `test_register_revertsOnFingerprintReuse_byDifferentIdentity` | (no-op — bindingId already pins fingerprint via `keccak(country, fingerprint)`; included as a sanity guard) |

Gas budget: `rotateWalletByProof` should be within ±10% of
`rotateWallet`'s current snapshot (~250k for the Groth16 verify
dominates; auth check is cheaper than ecrecover). Refresh
`snapshots/gas-snapshot.txt` post-implementation.

## Migration

V5.6 is a **fresh deploy**. The V5.4 deployed registries cannot
absorb the new `Binding.identityFingerprint` slot without storage
collision risk.

- `script/DeployV5_6UA.s.sol` deploys the new registry alongside the
  V5.4 one.
- Holders re-register on V5.6 to gain the recovery surface. Old V5.4
  bindings remain functional but lack lost-wallet recovery.
- SDK pumps a new ABI + new deployment address per the standard pump
  flow (`fixtures/contracts/<chain>.json` → web worker tree).
- Frontend gains a "Lost your wallet?" recovery flow under
  `/account/recover`, gated on the V5.6 ABI being present.
- Old V5.4 bindings get a one-time migration prompt: "Re-register on
  V5.6 to gain wallet-recovery support." Unconditional re-registration
  is cheap (one tx) and unlocks the new surface.

## Phase status snapshot delta (for repo CLAUDE.md)

Add to the §"Phase status snapshot" section:

- **V5.6 lost-wallet recovery** — design draft 2026-05-08
  (`docs/superpowers/specs/2026-05-08-v5_6-lost-wallet-recovery-amendment.md`).
  Pre-T0; awaiting founder signoff before plan-writing.

## Open questions

- **Should `rotateWalletByProof` also clear `usedNullifiers` for the
  binding's first-claim nullifier?** Argument for: lost-wallet user
  can re-prove fresh ctxHashes on the new wallet without nullifier
  collisions. Argument against: nullifier write-once is a load-
  bearing V5.1 invariant; clearing it on recovery breaks
  one-person-per-ctxHash anti-Sybil if a victim recovers from a
  legitimate proof. Default: leave nullifier untouched (matches
  `rotateWallet`'s behavior). Revisit if user testing surfaces
  friction.
- **Notification surface for `BindingRecovered`.** The frontend
  needs a way to alert the OLD wallet (or a registered notification
  endpoint) that recovery happened, even though the old wallet is
  presumably lost. Push to a Telegram/email channel registered at
  registration time? Out of scope for the contract amendment; flag
  as a frontend follow-up.
- **Per-deployment opt-in.** Should `rotateWalletByProof` be a
  feature flag set at deploy time, so high-value registries can opt
  out and force the timelock variant? Adds complexity; defer unless
  a deployment requests it.
