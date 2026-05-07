# V5.5 Multi-Algorithm Signature Extension

> Date: 2026-05-07.
>
> Status: draft design target.
>
> Scope: extend the current V5.2 contract+circuit stack so the same
> parser/nullifier architecture can support RSA now and additional
> signature algorithms later, without putting those signature
> verifiers back into the circuit.
>
> Builds on:
> - `2026-04-29-v5-architecture-design.md`
> - `2026-04-30-wallet-bound-nullifier-amendment.md`
> - `2026-05-01-keccak-on-chain-amendment.md`
> - current implementation:
>   - `packages/circuits/circuits/ZkqesPresentationV5.circom`
>   - `packages/contracts/src/ZkqesRegistryV5_2.sol`
>   - `packages/contracts/src/libs/P256Verify.sol`

## 1. Motivation

The current V5.2 stack is already halfway to a multi-algorithm design:

1. The circuit no longer verifies the certificate signatures in-circuit.
2. The contract already performs host-side signature verification.
3. The CAdES parser already understands both RSA and ECDSA leafs.

But the production V5.2 path is still structurally P-256-specific:

- the circuit commits P-256 affine coordinates via `SpkiCommit`,
- the witness builder assumes 91-byte P-256 SPKIs,
- the contract verifies signatures only through `P256Verify`,
- calldata shape for `leafSig` / `intSig` is fixed to ECDSA `(r, s)`.

That makes RSA support a full-stack fork today.

The correct extension is not "add RSA verification to the circuit".
The correct extension is:

- keep the circuit parser-centric,
- move all certificate-signature verification to the host chain,
- replace P-256-specific key commitments with a generic key-commit
  surface over canonical SPKI bytes,
- dispatch to host verifier libraries by the key/signature algorithm.

This gives us RSA now and a sane path for future algorithms.

## 2. Goals

1. Support `RSA PKCS#1 v1.5 + SHA-256` leaf/intermediate signatures in
   the V5 stack.
2. Preserve the current V5 value proposition: the circuit proves
   parsing, digest consistency, identity extraction, nullifier/privacy,
   and wallet binding; the host chain proves certificate signatures.
3. Avoid algorithm-specific public-signal layouts. RSA support must not
   require inventing an RSA-only proof ABI.
4. Make future host-side algorithms additive. Adding a new algorithm
   should primarily mean:
   - add one verifier library,
   - add one SPKI parser path,
   - add one trust-list ingestion rule,
   - not redesign the circuit again.
5. Tighten, not weaken, the glue between:
   - the certified leaf key,
   - the signature verifier,
   - the trust-list key commitment.

## 3. Non-Goals

1. No in-circuit RSA verification in the production path.
2. No attempt to preserve byte-for-byte compatibility with
   `ZkqesRegistryV5_2.sol` or the V5.2 proof public-signal layout.
   This is a new version.
3. No support in V5.5 for every RSA flavor or every future algorithm.
   V5.5 standardizes the extension mechanism and lands the first new
   algorithm family.
4. No non-EVM portability work. This spec assumes host-side
   verification on an EVM-family chain.

## 4. Current V5.2 Constraints

The current production path is P-256-specific in four places:

1. Circuit key commitment:
   `ZkqesPresentationV5.circom` consumes `leafXLimbs`, `leafYLimbs`,
   `intXLimbs`, `intYLimbs` and commits them through `SpkiCommit`.

2. Witness builder:
   `build-witness-v5.ts` calls `parseP256Spki(...)` and only accepts
   canonical 91-byte P-256 SPKIs.

3. Contract signature verification:
   `ZkqesRegistryV5_2.sol` uses `P256Verify.verifyWithSpki(...)` for both
   leaf and intermediate signatures.

4. Calldata signature format:
   `leafSig` and `intSig` are fixed to `bytes32[2]`, i.e. ECDSA `(r, s)`.

There is also a stronger architectural issue:

- the current `leafSpkiCommit` is derived from witness-supplied P-256
  key material, not from a slice extracted from the certified
  `leafTbsBytes` inside the circuit.

V5.5 fixes that by making the certified leaf key itself a circuit-bound
artifact.

## 5. Design Summary

V5.5 introduces a new parser-centric circuit and a generic host-side
verifier contract.

### 5.1 Circuit boundary

The circuit proves:

- `bindingBytes` parse correctly,
- `signedAttrs` parse correctly,
- `signedAttrs.messageDigest == sha256(bindingBytes)`,
- `leafTbsHash == sha256(leafTbsBytes)`,
- the identity fields come from the certified leaf,
- the wallet-binding / nullifier / identity-commitment logic,
- the **certified leaf public key** commits to `leafKeyCommit`.

The circuit does **not** prove:

- leaf signature validity,
- intermediate signature validity,
- trust-list membership of the intermediate key.

Those become host-side contract gates.

### 5.2 Contract boundary

The contract proves:

- calldata `signedAttrs` hashes to the proof's public `signedAttrsHash`,
- calldata `leafSpki` hashes to the proof's public `leafKeyCommit`,
- `leafSig` verifies over `sha256(signedAttrs)` using `leafSpki`,
- `intSig` verifies over `leafTbsHash` using `intSpki`,
- `intSpki` is in the trusted-list Merkle root,
- wallet derivation from the binding pk matches `msg.sender`,
- all existing timing / replay / identity-escrow gates.

### 5.3 Generic commitment surface

The current P-256-only `SpkiCommit` is replaced by a generic commitment:

`keyCommit = Poseidon2(KEY_COMMIT_DOMAIN, PoseidonChunkHashVar(spkiDerBytes))`

Where:

- `spkiDerBytes` are the canonical DER bytes of the leaf or intermediate
  `SubjectPublicKeyInfo`,
- `KEY_COMMIT_DOMAIN` is a fixed field constant for domain separation,
- `PoseidonChunkHashVar` is the existing byte-domain Poseidon hash
  already used elsewhere in the circuit.

This removes all coordinate/modulus-specific commitment logic from the
proof layer.

## 6. Public-Signal Layout (V5.5)

V5.5 replaces `leafSpkiCommit` / `intSpkiCommit` with a single
`leafKeyCommit` public signal that is actually tied to the certified leaf
inside the proof. Intermediate-key commitment moves fully on-chain.

Proposed public layout:

| Slot | Name | Meaning |
|---|---|---|
| 0 | `timestamp` | binding timestamp |
| 1 | `nullifier` | Poseidon₂(walletSecret, ctxFieldHash) |
| 2 | `ctxHashHi` | high 128 bits of `sha256(ctxBytes)` |
| 3 | `ctxHashLo` | low 128 bits |
| 4 | `bindingHashHi` | high 128 bits of `sha256(bindingBytes)` |
| 5 | `bindingHashLo` | low 128 bits |
| 6 | `signedAttrsHashHi` | high 128 bits of `sha256(signedAttrs)` |
| 7 | `signedAttrsHashLo` | low 128 bits |
| 8 | `leafTbsHashHi` | high 128 bits of `sha256(leafTbsBytes)` |
| 9 | `leafTbsHashLo` | low 128 bits |
| 10 | `policyLeafHash` | policy Merkle leaf |
| 11 | `leafKeyCommit` | commitment to certified leaf `SubjectPublicKeyInfo` |
| 12 | `identityFingerprint` | V5.1 fingerprint |
| 13 | `identityCommitment` | V5.1 commitment |
| 14 | `rotationMode` | 0 register / 1 rotate |
| 15 | `rotationOldCommitment` | V5.1 rotate gate |
| 16 | `rotationNewWallet` | V5.1/V5.2 rotate payload |
| 17 | `bindingPkXHi` | wallet pk X high |
| 18 | `bindingPkXLo` | wallet pk X low |
| 19 | `bindingPkYHi` | wallet pk Y high |
| 20 | `bindingPkYLo` | wallet pk Y low |

Total: 21 public signals.

This is intentionally smaller than V5.2. The contract no longer needs
the proof to carry a free-standing intermediate-key commitment; it can
compute that directly from `intSpki` at Gate 3.

## 7. Circuit Changes

### 7.1 New main circuit

Add:

- `packages/circuits/circuits/ZkqesPresentationV5_5.circom`

Derived from the current V5.2 main circuit, but with the P-256-only
SPKI block removed.

### 7.2 Remove P-256-specific witness inputs

Drop from the main witness:

- `leafXLimbs[6]`
- `leafYLimbs[6]`
- `intXLimbs[6]`
- `intYLimbs[6]`

These belong to the current `SpkiCommit` design and do not generalize.

### 7.3 Add certified-leaf SPKI slice inputs

Add:

- `leafSpkiBytes[MAX_LEAF_SPKI]`
- `leafSpkiLength`
- `leafSpkiOffsetInTbs`

The witness builder extracts the canonical DER `SubjectPublicKeyInfo`
sub-slice from the leaf TBSCertificate and passes:

- the bytes,
- the length,
- the offset of that slice inside `leafTbsBytes`.

The circuit then enforces byte equality:

`leafTbsBytes[leafSpkiOffsetInTbs .. + leafSpkiLength] == leafSpkiBytes`

This is the load-bearing glue that binds the verified leaf signature to
the certified leaf key.

### 7.4 Add generic key-commit primitive

Add:

- `packages/circuits/circuits/primitives/KeyCommitVar.circom`

Shape:

- input: `bytes[MAX_LEAF_SPKI]`, `length`
- output: `commit`

Construction:

1. `keyHash = PoseidonChunkHashVar(bytes, length)`
2. `commit = Poseidon2(KEY_COMMIT_DOMAIN, keyHash)`

The leaf block in the main circuit becomes:

- certified leaf SPKI slice equality
- `leafKeyCommit == KeyCommitVar(leafSpkiBytes, leafSpkiLength)`

No curve-specific or RSA-specific logic remains in the proof.

### 7.5 What stays unchanged

The following V5.2 machinery stays:

- binding parser
- SHA chains for binding / signedAttrs / leafTbs / ctx
- `SignedAttrsParser`
- `X509SubjectSerial`
- wallet-bound nullifier / identity fingerprint / identity commitment
- binding wallet-pk packing and contract-side `msg.sender` derivation

## 8. Witness Builder Changes

Add:

- `packages/circuits/src/build-witness-v5_5.ts`

Changes relative to `build-witness-v5.ts`:

1. Stop calling `parseP256Spki(...)`.
2. Extract the leaf `SubjectPublicKeyInfo` DER slice from the leaf cert.
3. Compute:
   - `leafSpkiOffsetInTbs`
   - `leafSpkiLength`
   - `leafSpkiBytes`
4. Compute `leafKeyCommit` using the same generic byte commitment as the
   circuit/contract.
5. Stop computing `intSpkiCommit` as a public signal.

The RSA path and future algorithm paths reuse the same witness shape.

## 9. Contract Changes

### 9.1 New registry version

Add:

- `packages/contracts/src/ZkqesRegistryV5_5.sol`

Keep `ZkqesRegistryV5_2.sol` unchanged for the existing P-256-only path.
V5.5 is a new registry/versioned entry point.

### 9.2 Generic key-commit library

Add:

- `packages/contracts/src/libs/KeyCommit.sol`

Responsibilities:

1. Accept canonical DER SPKI bytes.
2. Compute the same:
   `Poseidon2(KEY_COMMIT_DOMAIN, PoseidonChunkHashVar(spkiBytes))`
3. Return `keyCommit`.

This replaces `P256Verify.spkiCommit(...)` as the commitment surface.

### 9.3 Host-side verifier registry

Add a verifier-dispatch layer keyed by the SPKI algorithm OID extracted
from the provided `leafSpki` / `intSpki`.

Initial supported algorithms:

- `id-ecPublicKey + secp256r1`
  - verifier: current `P256Verify` flow
- `rsaEncryption`
  - verifier: OpenZeppelin `RSA.sol`
  - policy restriction: exponent MUST equal `65537`
  - signature mode: PKCS#1 v1.5 over SHA-256

Recommended interface:

```solidity
interface IHostSigVerifier {
    function verify(bytes calldata spki, bytes32 digest, bytes calldata sig)
        external view returns (bool);
}
```

In practice this may stay library-based rather than interface-based, but
the architectural rule is the same:

- dispatch by parsed SPKI algorithm,
- never by a proof-family special case.

### 9.4 Calldata signature shape

V5.5 changes:

- `leafSig: bytes`
- `intSig: bytes`

instead of `bytes32[2]`.

That is required for RSA and is also acceptable for P-256. The host
verifier decodes its own signature format.

### 9.5 Gate changes

V5.2 Gate 2a / 2b / 3 become:

1. `sha256(signedAttrs)` equals proof public hash.
2. `KeyCommit.commitSpki(leafSpki) == sig.leafKeyCommit`
3. `verifyLeaf(leafSpki, sha256(signedAttrs), leafSig)`
4. `verifyIssuer(intSpki, leafTbsHash, intSig)`
5. `PoseidonMerkle.verify(KeyCommit.commitSpki(intSpki), trustedListRoot)`

This is generic across algorithms.

## 10. Trusted-List / Flattener Changes

The trusted-list root must move from the current P-256-specific SPKI
commitment to the generic `KeyCommit` surface.

Changes:

1. Flattener emits canonical SPKI DER bytes for every eligible current
   intermediate certificate, not just P-256-specific coordinate paths.
2. Flattener computes `keyCommit` with the generic DER-byte commitment.
3. `trusted-cas.json` stores:
   - algorithm OID
   - canonical SPKI DER
   - generic `keyCommit`
4. Merkle root is over the generic `keyCommit`.

This lets one root cover P-256 and RSA simultaneously.

## 11. Supported Algorithms in V5.5

V5.5 standardizes the extension surface but only requires two concrete
host verifiers:

### 11.1 P-256 ECDSA

- SPKI: RFC 5480 named-curve `secp256r1`
- signature verification: `P256VERIFY` precompile via current
  `P256Verify.verifyWithSpki(...)`
- signature bytes: raw verifier-native bytes accepted by the host lib

### 11.2 RSA-2048 PKCS#1 v1.5

- SPKI: `rsaEncryption`
- exponent: fixed `65537`
- signature verification: OpenZeppelin `RSA.sol`
- digest: SHA-256
- signature bytes: raw RSA signature blob

### 11.3 Future algorithms

New algorithms are additive if they satisfy:

1. Host chain can verify them safely and economically.
2. The SPKI is canonically parseable from cert DER.
3. The verifier can consume `spki + digest + sig`.
4. The trusted-list pipeline can compute the same `keyCommit`.

Examples:

- other ECDSA curves
- RSA-PSS
- Ed25519 on a chain that exposes a native verifier

## 12. Security Invariants

V5.5 must preserve these load-bearing invariants:

1. `signedAttrs` bytes hashed in the proof are the same bytes verified by
   the contract.
2. `signedAttrs.messageDigest == sha256(bindingBytes)` in-circuit.
3. `leafTbsHash` in the proof is the same digest used by the issuer
   signature verifier on-chain.
4. `leafKeyCommit` is derived from a byte slice extracted from the
   certified `leafTbsBytes`, not from a free witness/calldata key.
5. The contract verifies the leaf signature with a `leafSpki` whose
   `keyCommit` equals the proof's `leafKeyCommit`.
6. The contract verifies the intermediate signature with an `intSpki`
   whose `keyCommit` is accepted by the trust-list Merkle root.
7. Wallet binding remains host-side:
   `binding wallet pk -> derived addr -> msg.sender`
8. Nullifier / identity commitment logic remains entirely algorithm-
   independent.

If any of these drifts, the system loses authenticity guarantees even if
the Groth16 proof still verifies.

## 13. Migration / Rollout

### 13.1 Versioning

Do not mutate V5.2 in place.

Land:

- new circuit
- new witness builder
- new registry version
- new generic trusted-list root

### 13.2 Rollout order

1. Implement generic `KeyCommit` in TS, Circom, and Solidity.
2. Implement `leafSpki` certified-slice binding inside the circuit.
3. Port current P-256 path onto V5.5 using the generic key-commit flow.
4. Add RSA host-side verifier.
5. Regenerate trusted-list root with generic commits.
6. Run a new ceremony for V5.5.
7. Deploy V5.5 registry on testnet.
8. Add RSA fixtures and end-to-end tests.

### 13.3 Recommended first acceptance target

Keep the first V5.5 production scope intentionally narrow:

- current UA / Diia P-256 path ported to the new generic architecture,
- one RSA QTSP path proven end-to-end,
- no additional algorithm families until both pass the same invariants.

## 14. Open Questions

1. Should `KeyCommit` commit canonical SPKI DER bytes exactly, or only
   the extracted public-key material with an algorithm-domain tag?
   Recommendation: canonical SPKI DER bytes. It removes algorithm-
   specific circuit logic and keeps contract/trust-root parity simple.

2. Should the leaf and intermediate verifier dispatch be driven purely by
   parsed SPKI OID, or also by an explicit signature-alg tag from the
   CMS/cert metadata?
   Recommendation: V5.5 drives by parsed SPKI OID and fixed SHA-256
   policy. If a future algorithm family needs multiple signature modes
   under one SPKI OID, add a calldata-side verifier tag then, not now.

3. Should intermediate cert bytes themselves be brought into the proof?
   Recommendation: not in V5.5. On-chain `intSpki + intSig + trust root`
   already establish the issuer side; the proof only needs the certified
   leaf and the signed binding.

## 15. Recommendation

Adopt the parser-centric V5.5 design:

- generic `leafKeyCommit` in the proof,
- generic `KeyCommit` on-chain and in the flattener,
- host-side verifier dispatch by SPKI algorithm,
- variable-length signature calldata,
- no in-circuit algorithm verifiers.

That is the smallest change that:

- adds RSA,
- preserves the current performance direction,
- and creates a believable path for future algorithms without another
  architecture reset.
