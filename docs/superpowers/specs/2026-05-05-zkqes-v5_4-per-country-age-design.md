# ZKQES V5.4 — Per-country Registries + Age Verification

> Date: 2026-05-05. Status: design target. Scope: V5.4 amendment shipping
> the per-country registry pattern + age verification for UA only.
>
> Builds on:
> - `2026-04-24-per-country-registries-design.md` (parked architectural sketch
>   — V5.4 lifts the relevant slice into shipping shape).
> - `2026-05-03-v5_3-oid-anchor-amendment.md` (V5.3 OID-anchor for
>   X509SubjectSerial — V5.4 layers age extraction on top of the same
>   anti-Sybil pattern).
> - `2026-05-05-multi-qtsp-facade-design.md` (just shipped at
>   `v0.7.1-civic-terminal-v3` — V5.4 extends `QtspMeta` schema with
>   `dobEncoding`).
> - `2026-05-05-dob-extractor-diia-rfc3739-audit.md` + `2026-05-05-dobcommit-exposure-recommendation.md`
>   (circuits-eng pre-brainstorm notes — load-bearing inputs).

## 1. Motivation

The shipped V5.3 registry on Base Sepolia is implicitly UA-only: trust
list anchors Diia's intermediates, the leaf walker assumes Diia's
ETSI EN 319 412-1 prefixes, the verifier slot is `immutable`. Every
non-UA QTSP that the multi-QTSP facade nominally welcomes (Italy /
Aruba PEC, Germany / D-TRUST, etc.) currently has nowhere to register
on chain.

Per-country registries make the implicit explicit: each country gets
its own `ZKQES*Registry` deploy with its own trust anchors + age
verifier. Adding a country = one fresh deploy, no redeploy of UA, no
shared mutable state across jurisdictions.

V5.4 ships **only UA's per-country registry plus age verification** —
the architectural pattern lands now while the cost of the redeploy is
already paid (the existing registry's `groth16Verifier` is `immutable`,
so any V5.x verifier swap requires a redeploy regardless). V5.5+
brings additional countries on demand.

A second motivation is **age verification**, an eIDAS-aligned compliance
primitive that has been deferred since V4. Many dApps need a
"prove user is at least N years old" gate without learning the
underlying birthdate. V5.4 ships this for UA/Diia using a parameterized
age cutoff: `dobYmd <= ageCutoffDate`, where the cutoff is a public
input. One artifact serves `>=18`, `>=21`, `born before 2007-05-01`,
etc., without per-jurisdiction re-ceremony.

## 2. Architecture overview

### 2.1 Per-country deploy shape

```
                ┌──────────────────────────┐
                │  IZKQESRegistry          │  shared interface; frozen
                │  (Solidity)              │  V5.4-onward
                └─────────┬────────────────┘
                          │ implemented by
            ┌─────────────┴─────────────┐
            ▼                           ▼
  ┌──────────────────┐         ┌──────────────────┐
  │  ZKQESRegistryUA │         │  ZKQESRegistry** │
  │  Base Sepolia    │         │  (V5.5+)         │
  │  V5.4 — SHIPPING │         │  V5.5 country #2 │
  └──────────────────┘         └──────────────────┘
       │
       ├─ identityVerifier: Groth16VerifierV5_3      (V5.3 22-signal)
       ├─ ageVerifier:      Groth16AgeVerifierUA     (V5.4 — Tier-2 Diia)
       ├─ trustedRoot:      bytes32  (UA — Diia intermediates)
       ├─ policyRoot:       bytes32  (UA legal-policy Poseidon root)
       ├─ country:          "UA"
       └─ admin:            TimelockSafeProxy
```

Both verifier slots are `immutable` — any future swap requires a fresh
registry deploy. This is acceptable because per-country registries are
small, deploys are cheap on Base, and immutability is the strongest
guarantee against admin compromise.

### 2.2 No router in V5.4

dApps integrate against `ZKQESRegistryUA`'s deploy address directly,
via the SDK's `deployments.ts` constants. The router contract
(`ZKQESRouter`) is deferred to V5.5 when country #2 actually onboards
— at that point, the router pattern's value proposition (dApps query
once, route to N countries) becomes concrete. Shipping a router for
one country is dead weight.

### 2.3 Naming convention

V5.4 introduces the **`ZKQES*` all-caps prefix** for new protocol
entities (`IZKQESRegistry`, `ZKQESRegistryUA`, `Groth16AgeVerifierUA`).
Existing entities (`ZkqesError`, `ZkqesCertificate`, `ZkqesRegistryV5_2`)
remain in the legacy PascalCase form pending a separate sweeping rename
arc. The new convention matches Solidity acronym style (`IERC20`,
`IERC721`).

## 3. Contract surface

### 3.1 `IZKQESRegistry` interface

```solidity
// packages/contracts/src/IZKQESRegistry.sol
pragma solidity ^0.8.24;

interface IZKQESRegistry {
    struct Binding {
        address pk;
        uint256 ctxHash;
        uint256 policyLeafHash;
        uint256 timestamp;
        uint256 dobCommit;       // 0 if dobSupported == 0
        uint8   dobSupported;    // 0 = no DOB, 1 = DOB-aware QTSP
        bool    revoked;
        uint256 nullifier;
    }

    struct ChainProof {
        uint256 rTL;
        uint256 algorithmTag;
        uint256 leafSpkiCommit;
    }
    // ChainProof carries only the on-chain bind values for the cert
    // chain. Chain verification itself is on-chain (P256Verify on the
    // intermediate cert + Poseidon Merkle climb to trustedRoot) — there
    // is no separate Groth16 chain proof. (Earlier brainstorm drafts
    // sketched (a, b, c) tuples here when split-proof was on the table;
    // V5.4 reverted to V5.2's unified architecture.)

    struct LeafProof {
        uint256[2]   a;
        uint256[2][2] b;
        uint256[2]   c;
        // ... V5.3 22-signal layout ...
    }

    struct AgeProof {
        uint256[2]   a;
        uint256[2][2] b;
        uint256[2]   c;
        uint256      ageQualified;     // must == 1
        uint256      ageCutoffDate;    // must == argument
        uint256      nullifierCtx;     // V5.1 anti-replay
    }

    function country() external view returns (string memory);
    function trustedRoot() external view returns (bytes32);
    function policyRoot() external view returns (bytes32);
    function identityVerifier() external view returns (address);
    function ageVerifier() external view returns (address);

    function register(
        ChainProof calldata chainProof,
        LeafProof calldata leafProof,
        bytes calldata leafSpki,
        bytes calldata intSpki,
        bytes calldata signedAttrs,
        bytes32[2] calldata leafSig,    // r, s of CAdES leaf signature
        bytes32[2] calldata intSig,     // r, s of intermediate cert signature
        bytes32[16] calldata trustMerklePath,
        uint256 trustMerklePathBits
    ) external returns (bytes32 bindingId);
    // Chain verification path: on-chain P256Verify(intSpki, signedAttrs, intSig)
    // + Poseidon Merkle climb (intSpki → trustMerklePath → trustedRoot).
    // No separate Groth16 chain proof. Calldata extras ported verbatim from
    // V5.2's register() shape.

    function rotateWallet(
        bytes32 bindingId,
        LeafProof calldata,
        address newWallet,
        bytes calldata sig
    ) external;

    function proveAge(
        bytes32 bindingId,
        uint256 ageCutoffDate,
        AgeProof calldata
    ) external returns (bool);

    function getBinding(bytes32 id) external view returns (Binding memory);
    function ageProvenCutoffs(bytes32 id, uint256 cutoff)
        external view returns (bool);

    // Events
    event BindingRegistered(bytes32 indexed id, address indexed pk, uint256 ctxHash);
    event BindingRotated(bytes32 indexed id, address indexed oldPk, address indexed newPk);
    event AgeProven(bytes32 indexed id, uint256 ageCutoffDate, address prover);
}
```

The interface is **frozen at V5.4** — V5.5 country #2 implements this
exact shape. Any breaking change requires a V6 amendment.

### 3.1.1 V5.1 / V5.2 schema-migration relaxations

V5.4 collapses V5.2's per-fingerprint storage shape (`identityWallets[fp]`,
`nullifierOf[wallet]`, `identityCommitments[fp]`) into a unified
`bindings[bindingId]` mapping keyed by `bindingId = keccak256(abi.encode(country, identityFingerprint))`.
Two V5.1/V5.2 invariants are intentionally relaxed as a consequence:

- **V5.1 wallet uniqueness across rotation** (V5.2's `nullifierOf[newWallet] != 0 → AlreadyRegistered` gate). Dropped because V5.4 has no wallet→bindingId reverse mapping. The load-bearing replay protection is the rotation auth-sig over the domain-bound payload (`chainid + addr(this) + bindingId + newWallet`) plus the on-chain `bindings[bindingId].pk == leafProof.bindingPk` check. Cardinality consequence: walletX *could* simultaneously be the bound wallet for multiple bindings (if Alice and Bob both rotate to walletX). Security is unaffected — Mallory still can't rotate a binding to a wallet she doesn't control.
- **V5.2 `CommitmentMismatch` rotateWallet stale-state check.** Dropped because V5.4 has no `identityCommitments` slot. The in-circuit `rotationOldCommitment === identityCommitment` `ForceEqualIfEnabled` gate (V5.3 22-signal layout slots 14, 16) plus the auth-sig domain binding are the load-bearing protections.

SDK consequence: web SDK + UI must not assume `wallet → binding` is unique. Enumerate via indexed events (see §3.2.1) rather than reverse mapping or localStorage.

### 3.2 `ZKQESRegistryUA` implementation

```solidity
// packages/contracts/src/ZKQESRegistryUA.sol
contract ZKQESRegistryUA is IZKQESRegistry {
    string public constant override country = "UA";
    string public constant VERSION = "ZKQES/V5.4";

    bytes32 public override trustedRoot;
    bytes32 public override policyRoot;
    IGroth16Verifier public immutable override identityVerifier;
    IGroth16AgeVerifier public immutable override ageVerifier;
    address public admin;

    mapping(bytes32 => Binding) public bindings;
    mapping(uint256 => bool) public usedNullifiers;
    mapping(bytes32 => mapping(uint256 => bool)) public ageProvenCutoffs;

    constructor(
        bytes32 _trustedRoot,
        bytes32 _policyRoot,
        address _identityVerifier,
        address _ageVerifier,
        address _admin,
        address _poseidonT3,
        address _poseidonT7
    ) {
        trustedRoot = _trustedRoot;
        policyRoot = _policyRoot;
        identityVerifier = IGroth16Verifier(_identityVerifier);
        ageVerifier = IGroth16AgeVerifier(_ageVerifier);
        admin = _admin;
        poseidonT3 = _poseidonT3;
        poseidonT7 = _poseidonT7;
    }
    // Poseidon T3+T7 are pre-deployed externally and passed in. Earlier
    // drafts had the constructor CREATE-deploy them internally, mirroring
    // V5.2's pattern, but the resulting initcode size (~41.6 KB) tripped
    // Base Sepolia's `max initcode size exceeded` policy on broadcast
    // (V5.2 squeaked under at 40.2 KB; V5.4's +1.5 KB delta tipped over).
    // Pre-deploying as separate contracts is the canonical Solidity
    // library pattern and reduces ZKQESRegistryUA's bytecode to ~6.3 KB.

    // ... register, rotateWallet, proveAge, admin functions ...
}
```

### 3.3 `proveAge` semantics

```solidity
function proveAge(
    bytes32 bindingId,
    uint256 ageCutoffDate,
    AgeProof calldata proof
) external returns (bool) {
    Binding memory b = bindings[bindingId];
    if (b.pk == address(0)) revert BindingNotFound();
    if (b.revoked) revert BindingRevoked();
    if (b.dobSupported != 1) revert DobNotAvailable();

    // Range-check cutoff to plausible birth-window
    if (ageCutoffDate < 19000101 || ageCutoffDate > 99991231)
        revert InvalidAgeCutoff();

    // Public-signal binding
    if (proof.ageQualified != 1) revert AgeNotQualified();
    if (proof.ageCutoffDate != ageCutoffDate) revert AgeCutoffMismatch();

    // V5.1 nullifier_ctx anti-replay: derive from binding state + cutoff
    uint256 expectedCtx = uint256(keccak256(abi.encodePacked(
        "zkqes-age-ctx-v1", bindingId, ageCutoffDate
    )));
    if (proof.nullifierCtx != expectedCtx) revert AgeNullifierContextMismatch();

    // Verify Groth16
    if (!ageVerifier.verifyProof(proof)) revert InvalidAgeProof();

    ageProvenCutoffs[bindingId][ageCutoffDate] = true;
    emit AgeProven(bindingId, ageCutoffDate, msg.sender);
    return true;
}
```

**Range-check on `ageCutoffDate`** is the policy-abuse mitigation: a
malicious dApp can't probe arbitrary integer cutoffs to binary-search
the underlying `dobYmd`. The 19000101–99991231 window covers all
plausible human birthdates while bounding the search space.

**Nullifier-context binding** ensures one age proof can't be replayed
against a different cutoff or different binding. The context derivation
is symmetric with the circuit's `nullifierCtx` public signal.

**Silent reverts** with no string interpolation prevent revert-string
side-channels that might leak partial information about the failure
location (e.g., revealing whether the failure was the cutoff range vs
the qualification check).

### 3.4 `dobCommit` is private

V5.4 does NOT expose `dobCommit` as a public signal. Per circuits-eng's
recommendation note (`docs/superpowers/notes/2026-05-05-dobcommit-exposure-recommendation.md`),
the per-country unified age circuit collapses the cross-circuit binding
that V4's `dobCommit` was designed to provide, removing the need for
public exposure. The `Binding.dobCommit` storage slot is retained for
forward-compat with potential V5.5+ delegated-prover use cases — set to
0 in V5.4 (V5.4 emits no commitment).

## 4. Circuits surface

### 4.1 `AgeDiiaUA` Tier-2 circuit

**Path:** `packages/circuits/circuits/age/AgeDiiaUA.circom`

**Constraint count estimate:** ~500K (well under pot22's 4M ceiling).

**Public signals (3):**

| Slot | Name | Type | Description |
|---|---|---|---|
| 0 | `ageQualified` | uint (0/1) | 1 if `dobYmd <= ageCutoffDate`, else 0 |
| 1 | `ageCutoffDate` | uint (YYYYMMDD) | Policy-bound public input |
| 2 | `nullifierCtx` | uint | V5.1 anti-replay context |

**Private witness:**

| Name | Type | Description |
|---|---|---|
| `dobYmd` | uint (YYYYMMDD) | Extracted DOB from Diia SDA |
| `leafTbsBytes` | byte array (MAX_DER=1408 / 1536) | Raw TBSCertificate bytes — full-cert scan window |
| `leafTbsLen` | uint | Actual length within leafTbsBytes |
| `nullifierSecret` | uint | V5.1 carry-through secret |

The witness shape mirrors the existing `DobExtractor(MAX_DER)`
template's signature (V5.3 OID-anchor amendment, audited 2026-05-05).
The extractor scans `leafTbsBytes[0..leafTbsLen]` for the Diia
extension OID prefix rather than consuming a pre-computed offset,
so no `sdaFrameOffset` field is needed — see §4.2.

### 4.2 SDA-frame anchoring (V5.31 pattern, scan-based)

Per circuits-eng's audit, `DobExtractor(MAX_DER)` already implements
SDA-frame anchoring — the same anti-Sybil pattern V5.3 codified for
X509SubjectSerial. The extractor is **scan-based** (not pre-located
offset based), which is functionally equivalent to offset-anchored
extraction: byte-equality at a matched scan position == byte-equality
at a pre-located offset. The scan dominates the constraint envelope
(~40K of the ~81K total at MAX_DER=1536) and trades off ~7K extra
constraints for elimination of the witness-side offset field.

The extractor:

1. Walks every byte position in `leafTbsBytes[0..leafTbsLen]`.
2. At each position, asserts the 5-byte ext-OID prefix
   `06 03 55 1D 09` (extensions sequence). On match, anchors the
   inner-OID byte-equality assertion.
3. Asserts the inner OID matches Diia's UA-arc OID
   (`1.2.804.2.1.1.1.11.1.4.11.1`, hex `0x06 0x0e 0x2a 0x86 0x...`).
4. Asserts the value-tag is `0x13` (PrintableString).
5. Asserts the length byte matches the declared content length.
6. Reads the leading 8 PrintableString bytes (YYYYMMDD).
7. Bounds the read window to the leading 8; the trailing
   `-NNNNN` (partial Ukrainian taxpayer INN) is NOT extracted.
8. Emits `dobSupported = 1` only when all OID-prefix assertions pass;
   non-Diia leaves emit `dobSupported = 0` and the registry rejects
   the binding via the `dobSupported === 1` constraint.

The audit note flagged this side-channel: the SDA window contains
identity material beyond the DOB. The extractor's bounded read prevents
the proof from committing to the trailing bytes, but auditors should
be aware. Future Tier-2 extractors for other countries follow the same
pattern: bound the read window, document what's NOT extracted.

### 4.3 Parameterized age cutoff

```circom
template AgeQualifyParameterized() {
    signal input dobYmd;            // YYYYMMDD as field element
    signal input ageCutoffDate;     // YYYYMMDD as field element
    signal output ageQualified;

    // ageQualified = (dobYmd <= ageCutoffDate)
    component leq = LessEqThan(32);
    leq.in[0] <== dobYmd;
    leq.in[1] <== ageCutoffDate;
    ageQualified <== leq.out;
}
```

`LessEqThan(32)` decomposes both operands into 32-bit `Num2Bits`
representations and compares bitwise. 32 bits comfortably covers
YYYYMMDD up to year 99991231.

### 4.4 What's NOT in V5.4

- **`AgeRFC3739` Tier-1 generic** — deferred to V5.5 with first
  RFC-3739-conformant QTSP onboarding.
- **`AgeCFItaly`, `AgePESELPoland`** — deferred to their respective
  country onboardings.
- **Multi-issuer age proof** (single proof covers multiple QTSPs) —
  out of scope.

## 5. Ceremony plan — single Phase B, both circuits

### 5.1 Per-contributor session shape

Each contributor in Phase B does **two contributions**, one per
circuit family:

```
Contributor session (~30-40 min total):
├─ V5.3 identity contribution (~20-30 min, 32 GB peak)
│   ├─ curl prev zkey from R2
│   ├─ snarkjs zkey contribute
│   ├─ snarkjs zkey verify
│   └─ curl PUT signed URL
├─ V5.4 age contribution (~3-5 min, <8 GB peak)
│   └─ same pattern, smaller circuit
└─ PGP-signed attestation chain entry covering both
```

The age circuit's smaller constraint count (~500K vs identity's ~3.9M)
makes its contribution roughly 10× faster, so adding it to the session
costs ~3-5 minutes per contributor on top of identity's 20-30.

### 5.2 R2 bucket layout extension

```
proving-1/
├── ceremony/
│   ├── v5.3-identity/                     ← existing per A2
│   │   ├── round-0001-prev.zkey           (= pot22 phase 1 final)
│   │   ├── round-0001-next.zkey
│   │   ├── round-0001-attestation.txt
│   │   └── ... per-round triplet ...
│   ├── v5.4-age-diia-ua/                  ← NEW
│   │   ├── round-0001-prev.zkey
│   │   ├── round-0001-next.zkey
│   │   ├── round-0001-attestation.txt
│   │   └── ...
│   └── attestations.jsonl                 ← combined chain — both circuits
└── ...
```

`attestations.jsonl` extension carries `circuit: "v5.3-identity" |
"v5.4-age-diia-ua"` field per entry so chain verification can validate
both lineages.

### 5.3 ceremony-coord scripts extension

`scripts/ceremony-coord/scripts/publish-status.ts` gains `--circuit`
flag (in addition to existing `--phase`). Per-contributor status now
reflects which circuit they just contributed to:

```
publish-status.ts \
  --circuit v5.4-age-diia-ua \
  --round 0003 \
  --contributor "alik.eth"
```

`status.json` payload extended with per-circuit round counter:

```jsonc
{
  "phase": "ceremony-live",
  "circuits": {
    "v5.3-identity":   { "round": 7, "lastContributor": "..." },
    "v5.4-age-diia-ua": { "round": 6, "lastContributor": "..." }
  },
  "finalZkeySha256": null
}
```

### 5.4 Coupling-risk note

Single-Phase-B-event coupling means V5.4 implementation timing gates
V5.3 ceremony fire date. If V5.4 hits a 2+ week implementation snag,
fallback path is split ceremonies (V5.3 fires alone with current
schedule, V5.4 ceremony separate later). The decision was made
consciously — V5.4 age circuit is structurally simpler than V5.3
identity (smaller constraints, reuses `DobExtractorDiiaUA`,
parameterized cutoff is a single comparator), so timing should track
or beat V5.3's ceremony-readiness window.

## 6. Web + SDK surface

### 6.1 SDK age proof builder

**Path:** `packages/sdk/src/witness/v5_4/build-age-witness.ts`

```ts
export interface BuildAgeWitnessArgs {
  signedCades: Buffer;           // CAdES envelope to extract DOB from
  bindingId: bytes32;            // existing binding (V5.3 register output)
  ageCutoffDate: number;         // YYYYMMDD
  nullifierCtxKeccak: bytes32;   // derived contract-side; passed in
}

export interface BuildAgeWitnessOutput {
  witness: Record<string, string | number>;
  publicSignals: {
    ageQualified: 0 | 1;
    ageCutoffDate: number;
    nullifierCtx: string;
  };
}

export async function buildAgeWitness(
  args: BuildAgeWitnessArgs
): Promise<BuildAgeWitnessOutput>;
```

Re-uses `parseP7s` + `DobExtractorDiiaUA`-equivalent SDA-frame walker
already present in `@zkqes/sdk` from V5.x work. The `dobYmd` extracted
is a private witness; never appears in the output `publicSignals`.

### 6.2 SDK exports

```ts
// packages/sdk/src/index.ts
export { buildAgeWitness, type BuildAgeWitnessArgs, type BuildAgeWitnessOutput }
  from './witness/v5_4/build-age-witness';

// packages/sdk/src/deployments.ts
export const ZKQES_REGISTRY_UA = {
  baseSepolia: {
    address: '0x...',  // post-deploy
    deployedAt: 'BLOCK_NUMBER',
    identityVerifier: '0x...',
    ageVerifier: '0x...',
  },
} as const;
```

dApps integrate via `ZKQES_REGISTRY_UA.baseSepolia.address`. V5.5
introduces `getRegistryFor(country)` that reads from the router; the
constant becomes the fallback.

### 6.3 Web — `proveAge` flow surface

New page at `/account/prove-age` (or folded as a section under
`/account/rotate`'s siblings as `/account/age-proof` — final placement
is web-eng's IA judgment at implementation time; both shapes satisfy
the spec).

User flow:

1. **Connect wallet** + select binding from connected wallet's bindings
   (read `getBinding()` for each registered nullifier the wallet maps to).
2. **Pick cutoff date.** Default = today − 18 years for `>=18`. Custom
   options: `>=21`, `born before YYYY-MM-DD` (manual entry).
3. **Generate proof.** Snarkjs in-Worker via `IProver` (same shape as
   `proveV5`); takes ~10-30s on the silver-tier device gate.
4. **Submit on-chain.** `proveAge(bindingId, cutoff, proof)` via the
   user's connected wallet. ~150-200K gas on Base Sepolia.
5. **Result UI.** Shows `ageQualified=true` + "verified to be at least
   N years old as of YYYY-MM-DD" — no DOB leak. Subsequent reads of
   `ageProvenCutoffs(bindingId, cutoff)` confirm the proven assertion
   for any consumer dApp.

The flow renders in civic-terminal v3 chrome; uses the existing
`ScwPassphraseModal` if the wallet is an SCW.

### 6.4 i18n

New `accountAgeProof.*` namespace under `packages/web/src/i18n/{en,uk}.json`,
mirrors the structure of `accountRotate.v3.*`:

- `accountAgeProof.heading`
- `accountAgeProof.lede`
- `accountAgeProof.bindingPicker.*`
- `accountAgeProof.cutoffPicker.*`
- `accountAgeProof.result.qualified`
- `accountAgeProof.result.notQualified`
- `accountAgeProof.error.*`

## 7. `QtspMeta` schema extension

The just-shipped multi-QTSP facade's `QtspMeta` Zod schema gets two
new fields, both required:

```ts
// packages/sdk/src/country/qtspMeta.ts (V5.4 extension)
export const DOB_ENCODINGS = ['rfc-3739', 'diia-ua', 'none'] as const;
export type DobEncoding = (typeof DOB_ENCODINGS)[number];

export const QtspMetaSchema = z.object({
  // ... existing V5.3-shipped fields ...
  dobEncoding: z.enum(DOB_ENCODINGS),       // NEW — required
  dobAttributeOid: z.string().nullable(),   // NEW — required, null when dobEncoding === 'none'
});
```

Initial values for shipped tiles:

| Country | QTSP | `dobEncoding` | `dobAttributeOid` |
|---|---|---|---|
| UA | Diia | `'diia-ua'` | `'1.2.804.2.1.1.1.11.1.4.11.1'` |
| (V5.5+ tier) IT | Aruba PEC | `'rfc-3739'` | `'1.3.6.1.5.5.7.9.1'` |
| (V5.5+ tier) ES | FNMT | `'none'` | `null` |

`'cf-italy'` and `'pesel-poland'` enum extensions land at V5.5+ as
those QTSPs onboard.

## 8. Migration path

### 8.1 Pre-deploy state (current — Base Sepolia)

```
fixtures/contracts/base-sepolia.json:
{
  "registryV5_2": "0xeE3bE208418DB51040e5983138C758C9eD154816",   ← stub-verifier deploy
  "groth16VerifierV5_2Stub": "0x5d63671653d9a047493386D494891fFDEc64007e",
  "zkqesCertificate": "0x1e6a264F760D80BBf9E6fb2700A69b93B46a1A63"
}
```

### 8.2 V5.4 deploy steps

1. **Phase B ceremony fires** (single event, both V5.3 identity + V5.4
   age circuits). Output: real `Groth16VerifierV5_3.sol` + real
   `Groth16AgeVerifierUA.sol`.
2. **Compile + deploy** both verifier contracts on Base Sepolia.
3. **Deploy `ZKQESRegistryUA`** with constructor args:
   - `_trustedRoot`: existing UA Diia trust list Poseidon root
   - `_policyRoot`: existing UA legal-policy Poseidon root
   - `_identityVerifier`: new Groth16VerifierV5_3 address
   - `_ageVerifier`: new Groth16AgeVerifierUA address
   - `_admin`: TimelockSafeProxy address
4. **Update fixtures:**
   ```
   fixtures/contracts/base-sepolia.json:
   {
     "_deprecated": {
       "registryV5_2": "0xeE3bE...4816",
       "groth16VerifierV5_2Stub": "0x5d63...07e",
       "deprecatedAt": "2026-05-XX",
       "reason": "Stub-verifier deploy retired post-Phase-B-ceremony"
     },
     "registryUA": "0x...",
     "groth16VerifierV5_3": "0x...",
     "groth16AgeVerifierUA": "0x...",
     "zkqesCertificate": "0x1e6a...1A63"
   }
   ```
5. **Pump fixtures to web worktree.** SDK `deployments.ts`
   `ZKQES_REGISTRY_UA.baseSepolia` updated with the new addresses.
6. **Web `RegisterV5Screen` + `RotateWalletFlow` + new `ProveAgeFlow`**
   read from the SDK constant. No code changes at consumer level beyond
   the constant value swap.
7. **Existing testnet bindings on the deprecated `registryV5_2`** are
   NOT migrated. Banner on the old contract address (or simply remove
   it from `deployments.ts`). Anyone with a stub-verifier-issued
   binding re-registers on the real-verifier deploy.
8. **`fixtures/trust/ua/diia/meta.json`** updated:
   - `dobEncoding: 'diia-ua'`
   - `dobAttributeOid: '1.2.804.2.1.1.1.11.1.4.11.1'`
   - `state: 'live'` (graduate from silver since real ceremony output
     + real registry ship together)
   - `promotedAt: 'YYYY-MM-DD'`
   - Add `samples.json` entry with `witnessGen: 'pass'` against the
     real Diia `.p7s` (replaces the synthetic-test-helper placeholder
     entries from T14.1).

### 8.3 The `_deprecated` audit-trail marker

Including a `_deprecated` block in `base-sepolia.json` rather than
silently removing the old addresses is an honesty signal. Future
auditors reading the file see what was abandoned and why, not just
the current state. This matches the multi-QTSP facade's
`samples.json::contributor: 'synthetic-test-helper'` pattern.

## 9. Out of scope

- **Router contract `ZKQESRouter`** — V5.5+ with country #2.
- **`AgeRFC3739` Tier-1 generic + `AgeCFItaly` + `AgePESELPoland`** —
  V5.5+ as those QTSPs onboard.
- **`'cf-italy'`, `'pesel-poland'` `dobEncoding` enum extensions** —
  added incrementally with their respective Tier-2 extractors.
- **Cross-country Sybil resistance** (one-wallet-per-HUMAN globally) —
  V6 escrow-era question; V5.4 grain stays per-country.
- **Mainnet deploy** — V5.4 stays on Base Sepolia. Mainnet gated on
  §9.4 acceptance + production audit.
- **`dobCommit` public exposure** — collapsed; default-private.
  Non-breaking to add later if delegated-prover use case surfaces.
- **ZeroDev sponsored-tx integration** — separate brainstorm queued
  post-V5.4-merge.
- **Sweeping rename of legacy `Zkqes*` entities to `ZKQES*`** —
  separate arc; V5.4 establishes the new convention only for new
  entities.

## 10. Success criteria

1. `ZKQESRegistryUA` deployed on Base Sepolia with real V5.3 identity
   verifier (post-Phase B) + real `Groth16AgeVerifierUA` (post-Phase B).
2. `IZKQESRegistry` interface frozen and consumed by `ZKQESRegistryUA`;
   ready for V5.5 country #2 to implement against without interface
   change.
3. **End-to-end age proof:** UA user with real Diia `.p7s` registers
   via `register()`, then proves age via `proveAge(bindingId,
   ageCutoff, proof)` with `ageQualified=true` for any cutoff ≤ their
   actual `dobYmd`. dApp can read `ageProvenCutoffs(bindingId, cutoff)
   == true` post-proof.
4. **Privacy posture:** `dobYmd` never appears in any public signal,
   calldata, event, or off-chain emission. Verified by an audit pass
   pre-mainnet.
5. **Phase B ceremony output** covers both V5.3 identity + V5.4 age
   circuits; ≥5 contributor sessions; combined attestations chain
   visible at `zkqes.org/ceremony`.
6. **`QtspMeta` schema extension** landed; `fixtures/trust/ua/diia/
   meta.json` updated with `dobEncoding: 'diia-ua'` + `dobAttributeOid:
   '1.2.804.2.1.1.1.11.1.4.11.1'`.
7. **Multi-QTSP facade integration:** the per-QTSP page at
   `/qtsp/UA/diia` shows the age-verification capability via the
   `dobEncoding` field — "age verification: yes" badge on UA tile.

## 11. Risks

- **Coupling risk** (acknowledged at decision time): V5.4 age circuit
  gates V5.3 ceremony fire date. If V5.4 implementation slips, V5.3
  testnet→mainnet path slips too. Mitigation: V5.4 age circuit is
  structurally simpler than V5.3 identity (smaller constraints, reuses
  existing extractor, parameterized cutoff is a single comparator).
  Fallback: split ceremonies if V5.4 hits a 2+ week snag.

- **`dobYmd` leak via revert-string content.** Audit checklist
  pre-mainnet: any `proveAge` failure path that reverts with a string
  containing computed values is a side-channel. V5.4 uses silent
  reverts (`revert AgeProofInvalid()` w/ no string interpolation).

- **`ageCutoffDate` policy abuse.** dApps could request odd cutoffs
  (`ageCutoffDate = 99999999`) to extract `dobYmd` via try-multiple-
  cutoffs binary search. Mitigations:
  1. On-chain range-check: `19000101 <= cutoff <= 99991231`.
  2. Off-chain: per-binding + per-(IP or signed-attestation) rate limit
     on the prover surface.
  3. Documented threat model in this spec.

- **Multi-circuit ceremony coordination bug.** ceremony-coord scripts
  already support per-A2 multi-circuit, but the chained attestations
  format may need extending to track per-circuit contribution lineage.
  Mitigation: synthetic 2-contributor dry run before live ceremony.

- **SDA partial-INN side-channel.** Diia's SDA carries
  `YYYYMMDD-NNNNN` where the trailing `-NNNNN` is partial Ukrainian
  taxpayer INN. The extractor's bounded read window prevents the proof
  from committing to those bytes, but auditors should be aware. This
  is documented in `docs/superpowers/notes/2026-05-05-dob-extractor-diia-rfc3739-audit.md`.

---

## Cross-references

- Parent: `2026-04-24-per-country-registries-design.md` — parked
  architectural sketch; V5.4 lifts the relevant slice.
- Parent: `2026-05-03-v5_3-oid-anchor-amendment.md` — V5.3 OID-anchor
  pattern reused.
- Parent: `2026-05-05-multi-qtsp-facade-design.md` — `QtspMeta` schema
  extended.
- Notes: `docs/superpowers/notes/2026-05-05-dob-extractor-diia-rfc3739-audit.md`
  (Diia DOB encoding NOT RFC-3739-conformant; UA needs Tier-2 forever).
- Notes: `docs/superpowers/notes/2026-05-05-dobcommit-exposure-recommendation.md`
  (default-private; escape hatches for delegated-prover + V6 escrow).
- Sibling: ZeroDev sponsored-tx brainstorm (queued post-V5.4-merge).
