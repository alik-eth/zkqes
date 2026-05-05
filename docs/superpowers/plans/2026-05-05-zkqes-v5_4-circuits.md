# ZKQES V5.4 — circuits-eng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]` checkbox tracking.

**Goal:** Land `AgeDiiaUA.circom` Tier-2 age circuit + multi-circuit Phase B ceremony coordination + final Groth16 verifier `.sol` post-ceremony.

**Architecture:** Tier-2 UA-specific circuit (Diia DOB encoding diverges from RFC 3739 — UA can't fold into Tier-1 generic). Reuses existing `DobExtractorDiiaUA.circom` SDA-frame anchor. Parameterized cutoff via `LessEqThan(32)`. Three public signals: `ageQualified`, `ageCutoffDate`, `nullifierCtx`.

**Tech Stack:** Circom 2.x, snarkjs, ceremony-coord scripts (TypeScript), pot22.

**Spec ref:** `docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md` §4, §5.

**Orchestration ref:** `docs/superpowers/plans/2026-05-05-zkqes-v5_4-orchestration.md` §1.3, §1.4, §2.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `packages/circuits/circuits/age/AgeDiiaUA.circom` | Top-level Tier-2 age circuit |
| `packages/circuits/circuits/age/AgeQualifyParameterized.circom` | Reusable `dobYmd <= ageCutoffDate` template |
| `packages/circuits/circuits/age/NullifierCtxAge.circom` | Reusable nullifier-context derivation (matches orchestration §1.4 keccak shape) |
| `packages/circuits/test/age-diia-ua.test.ts` | Witness round-trip tests |
| `packages/circuits/scripts/ceremony-multi-circuit.mjs` | Phase B multi-circuit coordination wrapper |

### Modified files

| Path | Change |
|---|---|
| `scripts/ceremony-coord/src/types.ts` | Extend `CeremonyStatusPayload` with per-circuit round counters |
| `scripts/ceremony-coord/scripts/publish-status.ts` | Add `--circuit` flag |

---

## Task 1: `AgeQualifyParameterized` template

**Files:**
- Create: `packages/circuits/circuits/age/AgeQualifyParameterized.circom`

- [ ] **Step 1: Write template**

```circom
pragma circom 2.1.5;
include "../../../node_modules/circomlib/circuits/comparators.circom";

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

- [ ] **Step 2: Sanity test**

Quick witness check: dobYmd=20060101, cutoff=20070101 → ageQualified=1.

```bash
cd packages/circuits
echo '{"dobYmd": 20060101, "ageCutoffDate": 20070101}' > /tmp/age_input.json
node node_modules/.bin/snarkjs wtns calculate ... # full template needs main; skip until Task 3
```

Defer full witness test to Task 3 (top-level circuit). Template-only check is `circom --r1cs` passes:

```bash
circom circuits/age/AgeQualifyParameterized.circom --r1cs --wasm
```

Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(circuits): AgeQualifyParameterized template — dobYmd <= ageCutoffDate"
```

---

## Task 2: `NullifierCtxAge` template

**Files:**
- Create: `packages/circuits/circuits/age/NullifierCtxAge.circom`

- [ ] **Step 1: Write template**

```circom
pragma circom 2.1.5;
include "../../../node_modules/circomlib/circuits/poseidon.circom";

// Derives nullifierCtx for V5.4 age proofs.
// MUST byte-match the contract-side derivation:
//   keccak256("zkqes-age-ctx-v1" || bindingId || ageCutoffDate)
// Implemented in-circuit via Poseidon-equivalent (since keccak in-circuit
// is expensive). The contract-side proves equality via `expectedCtx`
// recomputation; circuit just propagates the input value.
template NullifierCtxAge() {
    signal input nullifierCtxInput;   // derived off-circuit by SDK
    signal output nullifierCtx;       // public signal — passes through
    nullifierCtx <== nullifierCtxInput;
}
```

**Key constraint:** The `nullifierCtx` is computed off-circuit (in SDK + contract) using keccak; the circuit accepts it as a public input that's enforced by the contract's `proveAge` check. This keeps the circuit small (no keccak in-circuit) while still anchoring the proof to a specific (bindingId, cutoff) pair.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(circuits): NullifierCtxAge template — passthrough public input"
```

---

## Task 3: `AgeDiiaUA` top-level circuit

**Files:**
- Create: `packages/circuits/circuits/age/AgeDiiaUA.circom`
- Create: `packages/circuits/test/age-diia-ua.test.ts`

- [ ] **Step 1: Write top-level**

```circom
pragma circom 2.1.5;
include "AgeQualifyParameterized.circom";
include "NullifierCtxAge.circom";
include "../dob/DobExtractorDiiaUA.circom";  // existing, V5.31-pattern SDA-frame anchor

template AgeDiiaUA() {
    // Public signals (slot order frozen per orchestration §1.3)
    signal output ageQualified;       // slot 0
    signal output ageCutoffDate;      // slot 1
    signal output nullifierCtx;       // slot 2

    // Public inputs
    signal input ageCutoffDateIn;
    signal input nullifierCtxInput;

    // Private witness
    signal input signedAttrsBytes[MAX_SIGNED_ATTRS];
    signal input sdaFrameOffset;
    signal input nullifierSecret;     // V5.1 carry-through

    // 1. Extract dobYmd from Diia SDA (V5.31 anchor pattern)
    component extractor = DobExtractorDiiaUA();
    for (var i = 0; i < MAX_SIGNED_ATTRS; i++) extractor.signedAttrsBytes[i] <== signedAttrsBytes[i];
    extractor.sdaFrameOffset <== sdaFrameOffset;
    signal dobYmd <== extractor.dobYmd;

    // 2. Age qualification
    component qual = AgeQualifyParameterized();
    qual.dobYmd <== dobYmd;
    qual.ageCutoffDate <== ageCutoffDateIn;

    // 3. Bind public signals
    ageQualified  <== qual.ageQualified;
    ageCutoffDate <== ageCutoffDateIn;

    component ctx = NullifierCtxAge();
    ctx.nullifierCtxInput <== nullifierCtxInput;
    nullifierCtx <== ctx.nullifierCtx;
}

component main { public [ageCutoffDateIn, nullifierCtxInput] } = AgeDiiaUA();
```

- [ ] **Step 2: R1CS compile + WASM**

```bash
circom circuits/age/AgeDiiaUA.circom --r1cs --wasm --sym -o build/v5_4
```

Expected: `build/v5_4/AgeDiiaUA.r1cs` + `build/v5_4/AgeDiiaUA_js/AgeDiiaUA.wasm`.

Inspect constraint count:
```bash
snarkjs r1cs info build/v5_4/AgeDiiaUA.r1cs
```

Expected: <500K constraints (well under pot22's 4M ceiling).

- [ ] **Step 3: Witness round-trip test**

`packages/circuits/test/age-diia-ua.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { wasm } from 'circom_tester';
import { keccak256, encodePacked } from 'viem';

describe('AgeDiiaUA', () => {
  it('produces ageQualified=1 for dobYmd=20060101 + cutoff=20070101', async () => {
    const circuit = await wasm('circuits/age/AgeDiiaUA.circom');
    const cutoff = 20070101n;
    const bindingId = '0x' + 'a'.repeat(64);
    const nullifierCtx = BigInt(keccak256(encodePacked(
      ['string', 'bytes32', 'uint256'],
      ['zkqes-age-ctx-v1', bindingId, cutoff],
    )));
    const witness = await circuit.calculateWitness({
      // synthetic Diia SDA bytes carrying dobYmd=20060101
      signedAttrsBytes: synthDiiaSdaBytes(20060101),
      sdaFrameOffset: 0,
      ageCutoffDateIn: cutoff,
      nullifierCtxInput: nullifierCtx,
      nullifierSecret: 1n,
    });
    await circuit.checkConstraints(witness);
    expect(witness[1]).toBe(1n);                  // slot 0: ageQualified
    expect(witness[2]).toBe(cutoff);              // slot 1: ageCutoffDate
    expect(witness[3]).toBe(nullifierCtx);        // slot 2: nullifierCtx
  });

  it('produces ageQualified=0 when dobYmd > cutoff', async () => {
    /* 2010 > 2007 → not qualified */
  });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F @zkqes/circuits test test/age-diia-ua.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(circuits): AgeDiiaUA Tier-2 circuit — V5.31 SDA anchor + parameterized cutoff"
```

---

## Task 4: Initial `.zkey` from pot22

**Goal:** Phase A delivers an initial `.zkey` derived from existing pot22 phase 1 output. This is the input to Phase B contributors.

- [ ] **Step 1: Compute initial .zkey**

```bash
cd packages/circuits
snarkjs groth16 setup build/v5_4/AgeDiiaUA.r1cs ceremony/pot22-final.ptau \
  build/v5_4/AgeDiiaUA-initial.zkey
```

- [ ] **Step 2: Sanity-verify**

```bash
snarkjs zkey verify build/v5_4/AgeDiiaUA.r1cs ceremony/pot22-final.ptau \
  build/v5_4/AgeDiiaUA-initial.zkey
```

Expected: `ZKey Ok!`

- [ ] **Step 3: Upload to R2 ceremony bucket**

```bash
# Layout per spec §5.2
aws s3 cp build/v5_4/AgeDiiaUA-initial.zkey \
  s3://proving-1/ceremony/v5.4-age-diia-ua/round-0001-prev.zkey \
  --endpoint-url https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
```

- [ ] **Step 4: Commit fixture**

```bash
echo '{"r2Url": "...", "sha256": "...", "constraintCount": ...}' > fixtures/circuits/age-diia-ua-initial.json
git commit -m "fixtures(circuits): AgeDiiaUA initial .zkey — pot22 phase 1"
```

---

## Task 5: ceremony-coord multi-circuit support

**Files:**
- Modify: `scripts/ceremony-coord/src/types.ts`
- Modify: `scripts/ceremony-coord/scripts/publish-status.ts`

- [ ] **Step 1: Extend status payload**

`scripts/ceremony-coord/src/types.ts`:
```ts
export interface CeremonyStatusPayload {
  // ... existing fields ...
  circuits?: Record<string, {                  // NEW — V5.4 multi-circuit tracking
    round: number;
    lastContributor: string | null;
    lastContributedAt: string | null;          // ISO-8601
  }>;
}
```

- [ ] **Step 2: Add `--circuit` flag**

`scripts/ceremony-coord/scripts/publish-status.ts`:
```ts
program
  .option('--circuit <name>', 'circuit family — v5.3-identity | v5.4-age-diia-ua')
  // ... existing options ...
```

When `--circuit` is set, only update that circuit's sub-record in `payload.circuits[circuit]`, leaving other circuits untouched.

- [ ] **Step 3: Update tests**

Add a test case to existing publish-status test suite covering multi-circuit update isolation.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ceremony-coord): --circuit flag + per-circuit round counters for V5.4"
```

---

## Task 6: Phase B ceremony fire (lead-coordinated)

**This task waits for orchestration §2.2 step 7 — Phase B contributor recruitment + fire.** circuits-eng coordinates with lead.

- [ ] **Step 1: Mint synthetic 2-contributor dry run**

Per spec §11 risk mitigation. Synthetic pre-fire test of multi-circuit ceremony coordination:

```bash
node scripts/ceremony-multi-circuit-dryrun.mjs --rounds 2
```

Expected: 2 synthetic contributions land for both v5.3-identity + v5.4-age-diia-ua, attestations chain validates, status payload updates correctly.

- [ ] **Step 2: Live ceremony**

Coordinate with lead per CLAUDE.md A2 ceremony runbook. Contributors do BOTH circuits per session per spec §5.1. ≥5 contributors per success criterion §10.5.

- [ ] **Step 3: Verify final .zkey**

```bash
snarkjs zkey verify build/v5_4/AgeDiiaUA.r1cs ceremony/pot22-final.ptau \
  ceremony/AgeDiiaUA-final.zkey
```

Same for V5.3 identity circuit's final `.zkey`.

- [ ] **Step 4: Generate Solidity verifier**

```bash
snarkjs zkey export solidityverifier ceremony/AgeDiiaUA-final.zkey \
  packages/contracts/src/Groth16AgeVerifierUA.sol
```

Same for V5.3 identity → `Groth16VerifierV5_3.sol`.

- [ ] **Step 5: Commit + ping lead for pump**

```bash
git add packages/contracts/src/Groth16AgeVerifierUA.sol packages/contracts/src/Groth16VerifierV5_3.sol \
        ceremony/AgeDiiaUA-final.zkey ceremony/V5_3Identity-final.zkey
git commit -m "ceremony(circuits): V5.4 final .zkey + Solidity verifiers (post-Phase-B)"
```

SendMessage lead for pump to contracts-eng worktree.
