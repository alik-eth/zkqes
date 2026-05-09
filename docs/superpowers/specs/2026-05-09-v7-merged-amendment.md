# ZKQES V7 — Merged Amendment (V5.5 wire + V5.6 features)

> Date: 2026-05-09. Status: integration spec.
>
> Builds on:
> - [`2026-05-07-v5_5-multi-algorithm-signature-extension.md`](2026-05-07-v5_5-multi-algorithm-signature-extension.md) (wire format)
> - [`2026-05-08-v5_6-lost-wallet-recovery-amendment.md`](2026-05-08-v5_6-lost-wallet-recovery-amendment.md) (unified register)
> - [`2026-05-05-zkqes-v5_4-per-country-age-design.md`](2026-05-05-zkqes-v5_4-per-country-age-design.md) (age verifier surface)
> - [`2026-05-09-country-identifier-privacy-guideline.md`](2026-05-09-country-identifier-privacy-guideline.md) (per-country posture)

## 1. Purpose

V5.5 and V5.6 landed on `main` as parallel artefacts:

- **V5.5** lives in `ZkqesRegistryV5_5.sol`: 21-signal verifier ABI, algorithm-agnostic
  `KeyCommit` leaves, `HostSig` dispatch, variable-length signature calldata.
  Country-blind template; no age verifier; not deployed.
- **V5.6** lives in `ZKQESRegistryUA.sol`: V5.4 22-signal verifier ABI, country-bound
  ("UA"), unified `register()` with rebind branch, atomic `registerWithAge()`,
  per-country age verifier slot, `Binding` struct with `dobSupported`.

V7 collapses the two into one production contract per country:

- V5.5 wire format (21 signals, KeyCommit, HostSig, `bytes` sigs);
- V5.6 features (unified register + rebind, registerWithAge, proveAge, ageProvenCutoffs);
- per-country deploy (UA first; the per-country contract naming convention from CLAUDE.md
  applies — `ZKQESRegistryUA` becomes the V7 contract for Ukraine).

## 2. What V7 is NOT

- Not a new circuit. Reuses the V5.5 main circuit (5,604,710 constraints,
  21 public signals, frozen layout). Pot23 ceremony output is V7's identity
  verifier as well.
- Not a new public-signal layout. The 21-signal layout of
  `2026-05-07-v5_5-multi-algorithm-signature-extension.md §6` is FROZEN for V7.
- Not a multi-country contract. Country scope stays at the contract level
  (CLAUDE.md "country scope is per-country at the contract level").
- Not a new age circuit. UA continues to use `AgeDiiaUA` (3 public signals).

## 3. Frozen surface

### 3.1 21-signal public layout (FROZEN — verbatim from V5.5 spec §6)

```
[0]  timestamp
[1]  nullifier
[2]  ctxHashHi
[3]  ctxHashLo
[4]  bindingHashHi
[5]  bindingHashLo
[6]  signedAttrsHashHi
[7]  signedAttrsHashLo
[8]  leafTbsHashHi
[9]  leafTbsHashLo
[10] policyLeafHash
[11] leafKeyCommit              ← V5.5 (replaces V5.4 leafSpkiCommit)
                                 V5.4 [12] intSpkiCommit DROPPED
[12] identityFingerprint
[13] identityCommitment
[14] rotationMode               ← V7: PINNED to 0 (see §3.4)
[15] rotationOldCommitment      ← V7: must equal identityCommitment (no-op)
[16] rotationNewWallet          ← V7: must equal uint160(msg.sender)
[17] bindingPkXHi
[18] bindingPkXLo
[19] bindingPkYHi
[20] bindingPkYLo
```

### 3.2 IZKQESRegistry interface diff vs V5.6

`LeafProof` struct:

| Slot | V5.6 (V5.4 wire) | V7 (V5.5 wire) | Notes |
|------|-------------------|----------------|-------|
| 11 | `leafSpkiCommit` | `leafKeyCommit` | rename; algorithm-agnostic |
| 12 | `intSpkiCommit` | DROPPED | contract recomputes from `intSpki` |

Renumber everything below slot 12 by −1 to land at the 21-signal layout.

`ChainProof` struct:

| Field | V5.6 | V7 | Notes |
|-------|------|----|-------|
| `rTL` | kept | kept | snapshot of `trustedRoot` at call time |
| `algorithmTag` | kept (must == 0) | DROPPED | V5.5 dispatches via `HostSig` per SPKI |
| `leafSpkiCommit` | kept | renamed to `leafKeyCommit` | cross-bind to `LeafProof.leafKeyCommit` |

Signature calldata:

- `bytes32[2] leafSig` → `bytes calldata leafSig`
- `bytes32[2] intSig`  → `bytes calldata intSig`

(P-256 still 64 bytes; RSA-2048+ ranges 256-512 bytes. Variable length is the
V5.5 enabler for non-ECDSA algorithms.)

Function signatures impacted: `register`, `registerWithAge`. `proveAge` is
unchanged (no leaf SPKI in its call).

### 3.3 Gate order (V7 register)

```
Gate 0   : rotationMode == 0  (V5.6 dropped rotateWallet; V7 keeps mode pinned)
Gate 0a' : keccak-derive caller from bindingPk* limbs (V5.2 carry-over)
Gate 0b  : ChainProof bind-values cross-check
            chainProof.rTL            == uint256(trustedRoot)
            chainProof.leafKeyCommit  == leafProof.leafKeyCommit
Gate 1   : Groth16 verify (21 publics)
Gate 2a  : sha256(signedAttrs) hi/lo bind
            KeyCommit.commitSpki(leafSpki) == leafProof.leafKeyCommit
Gate 2b  : HostSig.verify(leafSpki, sha256(signedAttrs), leafSig)
Gate 3   : HostSig.verify(intSpki, leafTbsHash, intSig)
Gate 4   : PoseidonMerkle.verify(KeyCommit(intSpki), trustMerklePath, trustedRoot)
            (V5.5 NEW: intKeyCommit recomputed on-chain — V5.4 had it as a public signal)
Gate 5   : PoseidonMerkle.verify(policyLeafHash, policyMerklePath, policyRoot)
Gate 6   : timing (FutureBinding / StaleBinding; MAX_BINDING_AGE = 1 hour)
Gate 7   : binding write — first-claim or rebind branch (V5.6 unified)
            bindingId = keccak256(abi.encode(country, identityFingerprint))
            first-claim:  usedNullifiers[nullifier] gate; write-once nullifier
            rebind:       BindingRevoked check; preserve nullifier + ageProvenCutoffs;
                          emit BindingRebound iff oldPk != caller
```

### 3.4 rotationMode pinning

V5.5's `ZkqesRegistryV5_5.sol` reserves `rotationMode == 1` for a separate
`rotateWallet()` entry point. V7 drops `rotateWallet()` (V5.6 unified-register
removes it) but KEEPS slot [14] in the public-signal layout for circuit
ABI compatibility — the same compiled circuit serves V5.5-style rotateWallet
testbeds and V7 production.

`register` enforces `rotationMode == 0` at Gate 0. The slot is otherwise
unused on-chain.

### 3.5 Dropped V5.4/V5.6 surface

| Item | Reason |
|------|--------|
| `chainProof.algorithmTag` | V5.5 `HostSig` dispatches per SPKI — algorithm tag is redundant. |
| `LeafProof.intSpkiCommit` | V5.5 recomputes `KeyCommit(intSpki)` on-chain (Gate 4). |
| `bytes32[2]` sig fields | V5.5 widens to `bytes` for RSA-2048+ support. |
| `IGroth16VerifierV5_3` interface | Replaced by `IGroth16VerifierV5_5` (uint256[21] input). |
| `P256Verify.verifyWithSpki` call sites | Replaced by `HostSig.verify` (algorithm-dispatched). |

### 3.6 Preserved V5.6 surface

| Item | Behaviour |
|------|-----------|
| `Binding` struct (8 fields incl. `dobSupported`, `dobCommit`, `nullifier`) | Verbatim. |
| `usedNullifiers[uint256] => bool` | Verbatim; gates first-claim only. |
| `ageProvenCutoffs[bindingId][cutoff]` | Verbatim; persists across rebinds. |
| `proveAge(bindingId, cutoff, AgeProof)` | Verbatim — no V5.5 wire impact. |
| `registerWithAge(...)` | Surface unchanged; internal `_register` + `_proveAge` rewired to V5.5 gates. |
| `BindingRegistered` / `BindingRebound` / `AgeProven` events | Verbatim. |
| Admin: `setTrustedRoot` / `setPolicyRoot` / `setRevoked` / `transferAdmin` | Verbatim. |

## 4. Per-country naming

V7 reuses the per-country contract pattern from CLAUDE.md:

- `ZKQESRegistryUA` (V7) — Ukraine, `country = "UA"`, `AgeDiiaUA` verifier.
- Future: `ZKQESRegistryDE`, `ZKQESRegistryFR`, … one fork per country.

The V7 source file `src/ZKQESRegistryUA.sol` REPLACES the V5.6 contract
(same path, same contract name). `src/ZkqesRegistryV5_5.sol` is DELETED —
its 21-signal pack + KeyCommit + HostSig wiring is absorbed into the V7
ZKQESRegistryUA. The V5.5 country-blind template is no longer needed
because the per-country pattern is the production shape.

## 5. Privacy posture

Per `2026-05-09-country-identifier-privacy-guideline.md` §8: UA = Bucket A
(operationally public TINUA-prefixed serial). V7 changes nothing about
that posture — the `identityFingerprint` derivation
(`Poseidon₂(subjectSerialPacked, FINGERPRINT_DOMAIN)`) is unchanged from
V5.4/V5.6 and remains dictionary-attackable for UA.

V7 does NOT introduce a hidden derivation layer. Future per-country forks
that need Bucket-D semantics will require a separate amendment.

## 6. Implementation phases

### Phase 1 — interface + contract

- [ ] `src/IZKQESRegistry.sol` — `LeafProof` slot 11 rename + slot 12 drop
      + slot renumber; `ChainProof` `algorithmTag` drop + `leafSpkiCommit` →
      `leafKeyCommit` rename; `register`/`registerWithAge` sig swap to
      `bytes calldata` for `leafSig`/`intSig`.
- [ ] `src/ZKQESRegistryUA.sol` — replace V5.4 verifier interface with
      `IGroth16VerifierV5_5`, swap `P256Verify` for `HostSig`, swap
      `_packPublicSignals` to 21-signal, recompute `intKeyCommit` on-chain
      in Gate 4, rename `leafSpkiCommit` → `leafKeyCommit` end-to-end.
      Bump `VERSION` to `"ZKQES/V7"`.
- [ ] `src/ZkqesRegistryV5_5.sol` — DELETE.

### Phase 2 — tests

- [ ] `test/ZKQESRegistryUA.t.sol` — full rewrite. 21-signal pack, KeyCommit
      leaf assertions, HostSig dispatch (use existing P-256 fixtures + add
      one RSA fixture if HostSig.t.sol has one), `bytes` sig calldata,
      Gate 4 intKeyCommit recomputation, retain V5.6 unified-register tests
      (rebind, NullifierUsed, registerWithAge, age-cutoff persistence).
- [ ] `test/ZkqesRegistryV5_5.t.sol` — DELETE alongside the source.
- [ ] `test/Declarations.t.sol` — update to look for `BindingRebound` (already
      done in V5.6) and confirm no stray V5.4 ABI references.

### Phase 3 — deploy + downstream

- [ ] `script/DeployV5_5.s.sol` (if exists) → consolidate into
      `DeployV7.s.sol` (or repurpose `DeployV5_4UA.s.sol`).
      Constructor takes V5.5 verifier address + age verifier address +
      Poseidon T3/T7 + admin + initial roots.
- [ ] `packages/contracts-sdk/src/abi/ZkqesRegistryUA.ts` — regenerate from
      V7 ABI; rename to keep stable export name.
- [ ] `packages/sdk` — V7 calldata builder (mirrors web pipeline); types for
      21-signal `LeafProof`.
- [ ] `packages/web/src/lib/uaProofPipelineV5_2.ts` (or equivalent) —
      retarget to V7 calldata + 21-signal witness.
- [ ] `packages/web/src/hooks/useV5_4BindingsForWallet.ts` —
      `BindingRebound` already done; verify no V5.4 ABI assumptions.

## 7. Out of scope (deferred)

- New country deploys (DE/FR/IT/PL/HU/AT). V7 ships UA only; per-country
  forks land via `2026-05-09-country-identifier-privacy-guideline.md` §6
  onboarding checklists.
- New circuit. V7 = V5.5 circuit + V5.6 contract behaviour. Re-circuit
  changes require their own amendment.
- Bucket-D hidden derivation. Future amendment.
- `setIdentityVerifier` / `setAgeVerifier` admin setters. Verifier slots
  remain `immutable` per V5.4/V5.5 posture; rotation = redeploy.

## 8. Decision

V7 ships as the integration tag for V5.5 wire + V5.6 features in one
per-country contract. Parallel V5.5 (`ZkqesRegistryV5_5.sol`) and V5.6
(`ZKQESRegistryUA.sol` 22-signal) are SUPERSEDED.
