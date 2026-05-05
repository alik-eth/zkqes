// AgeDiiaUA witness round-trip tests (T3 of V5.4 plan).
//
// Synthesizes Diia-shaped SDA bytes inline (matches the layout established
// by `test/primitives/dob/DobExtractorDiiaUA.test.ts`'s synthetic case)
// rather than depending on the real-Diia fixture (`fixtures/dob/ua/diia-
// admin.der.txt`) which isn't present in this worktree. Synthetic + real
// fixture coverage is at the DobExtractor layer; here we exercise the
// AgeDiiaUA composition (extractor → AgeQualifyParameterized → ctx
// passthrough) under the V5.10 isomorphism equality constraints.
//
// Public signal layout per orchestration §1.3 (FROZEN):
//   slot 0: ageQualified
//   slot 1: ageCutoffDate
//   slot 2: nullifierCtx
//
// witness[0] = 1 (snarkjs convention); witness[1..3] = the 3 public
// signals in declaration order under V5.10 isomorphism (which matches
// the [0,1,2] slot order since all are `signal input`).

import { expect } from 'chai';

import { compile, type CompiledCircuit } from './helpers/compile';

const MAX_DER = 1536;

// ===== Synthetic Diia SDA byte layout (matches DobExtractorDiiaUATest) =====

const OUTER = [0x06, 0x03, 0x55, 0x1d, 0x09];                  // ext OID 2.5.29.9
const WRAP = [0x04, 0x24, 0x30, 0x22, 0x30, 0x20];             // OCTET STRING + SEQUENCE OF Attribute + first Attribute SEQUENCE
const INNER = [
  0x06, 0x0c, 0x2a, 0x86, 0x24, 0x02, 0x01, 0x01,
  0x01, 0x0b, 0x01, 0x04, 0x0b, 0x01,                          // attr OID 1.2.804.2.1.1.1.11.1.4.11.1
];
const SET = [0x31, 0x10, 0x13, 0x0e];                          // SET of 16 + PrintableString of 14
const TAIL = [0x2d, 0x31, 0x32, 0x33, 0x34, 0x35];             // "-12345" (synthetic partial INN tail)

/**
 * Build a Diia-shaped DER carrying `dobYmd` (YYYYMMDD as integer) at
 * canonical SDA offset = 0. Right-padded with zero bytes to MAX_DER.
 */
function buildDiiaDer(dobYmd: number): {
  leafDER: number[];
  leafDerLen: number;
} {
  const ymdStr = String(dobYmd).padStart(8, '0');
  if (ymdStr.length !== 8) throw new Error(`dobYmd must be 8 digits: ${dobYmd}`);
  const digits = Array.from(ymdStr).map((c) => c.charCodeAt(0));
  const der = [...OUTER, ...WRAP, ...INNER, ...SET, ...digits, ...TAIL];
  return {
    leafDER: [...der, ...new Array(MAX_DER - der.length).fill(0)],
    leafDerLen: der.length,
  };
}

/**
 * Non-Diia DER — random bytes, no OID 2.5.29.9 anywhere. Used to drive
 * the `extractor.dobSupported === 1` soundness gate negatively.
 */
function buildNonDiiaDer(): { leafDER: number[]; leafDerLen: number } {
  const der = new Array(100).fill(0x42);
  return {
    leafDER: [...der, ...new Array(MAX_DER - der.length).fill(0)],
    leafDerLen: der.length,
  };
}

// Synthetic nullifierCtxInput. The circuit only passes this through to
// public slot 2 (no in-circuit keccak validation per orchestration §1.4
// off-circuit-keccak design). Contract-side `ZKQESRegistryUA.proveAge`
// enforces the actual ctx binding. For circuit tests we just need any
// valid field element.
const SYNTHETIC_NULLIFIER_CTX = 0x0123456789abcdefn;

describe('AgeDiiaUA — V5.4 Tier-2 age circuit', function () {
  this.timeout(600000);

  let circuit: CompiledCircuit;

  before(async () => {
    circuit = await compile('age/AgeDiiaUA.circom');
  });

  it('emits ageQualified=1 when dobYmd <= ageCutoffDate (synthetic Diia DER)', async () => {
    const { leafDER, leafDerLen } = buildDiiaDer(20060101);
    const ageCutoffDate = 20070101n;
    const ageQualified = 1n;

    const witness = await circuit.calculateWitness(
      {
        // public signals (slot order [0, 1, 2])
        ageQualified,
        ageCutoffDate,
        nullifierCtx: SYNTHETIC_NULLIFIER_CTX,
        // private witness
        leafTbsBytes: leafDER,
        leafTbsLen: leafDerLen,
        nullifierCtxInput: SYNTHETIC_NULLIFIER_CTX,
      },
      true,
    );
    await circuit.checkConstraints(witness);

    // V5.10 isomorphism: public signals are `signal input`, so they land
    // in witness[1..3] in declaration order. No `signal output` =>
    // public.json indexing matches FROZEN §1.3 slot order byte-for-byte.
    expect(witness[1]).to.equal(ageQualified);
    expect(witness[2]).to.equal(ageCutoffDate);
    expect(witness[3]).to.equal(SYNTHETIC_NULLIFIER_CTX);
  });

  it('emits ageQualified=0 when dobYmd > ageCutoffDate (synthetic Diia DER)', async () => {
    const { leafDER, leafDerLen } = buildDiiaDer(20100101);
    const ageCutoffDate = 20070101n; // dob is AFTER cutoff → not qualified
    const ageQualified = 0n;

    const witness = await circuit.calculateWitness(
      {
        ageQualified,
        ageCutoffDate,
        nullifierCtx: SYNTHETIC_NULLIFIER_CTX,
        leafTbsBytes: leafDER,
        leafTbsLen: leafDerLen,
        nullifierCtxInput: SYNTHETIC_NULLIFIER_CTX,
      },
      true,
    );
    await circuit.checkConstraints(witness);

    expect(witness[1]).to.equal(0n); // ageQualified
    expect(witness[2]).to.equal(ageCutoffDate);
  });

  // Soundness gate: prover claims ageQualified=1 when dobYmd > cutoff.
  // The internal `ageQualified === qual.ageQualified` constraint must
  // fire — witness gen fails before the LessEqThan even matters.
  it('rejects a wrong ageQualified claim (V5.10 isomorphism equality fires)', async () => {
    const { leafDER, leafDerLen } = buildDiiaDer(20100101);
    const ageCutoffDate = 20070101n; // dob AFTER cutoff → computed=0
    const wrongAgeQualified = 1n;     // prover lies

    let threw = false;
    try {
      await circuit.calculateWitness(
        {
          ageQualified: wrongAgeQualified,
          ageCutoffDate,
          nullifierCtx: SYNTHETIC_NULLIFIER_CTX,
          leafTbsBytes: leafDER,
          leafTbsLen: leafDerLen,
          nullifierCtxInput: SYNTHETIC_NULLIFIER_CTX,
        },
        true,
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  // Soundness gate: non-Diia leaf (no OID 2.5.29.9) sets DobExtractor's
  // `dobSupported = 0`. The `extractor.dobSupported === 1` constraint
  // in AgeDiiaUA must fire. Without this gate, a malicious prover
  // could submit a degenerate cert + claim ageQualified=1 trivially.
  it('rejects a non-Diia leaf (dobSupported === 1 soundness gate fires)', async () => {
    const { leafDER, leafDerLen } = buildNonDiiaDer();
    const ageCutoffDate = 20070101n;
    const ageQualified = 1n;

    let threw = false;
    try {
      await circuit.calculateWitness(
        {
          ageQualified,
          ageCutoffDate,
          nullifierCtx: SYNTHETIC_NULLIFIER_CTX,
          leafTbsBytes: leafDER,
          leafTbsLen: leafDerLen,
          nullifierCtxInput: SYNTHETIC_NULLIFIER_CTX,
        },
        true,
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });

  // V5.10 isomorphism for nullifierCtx: prover claims a different
  // public-slot value than the supplied passthrough input. The
  // `nullifierCtx === ctx.nullifierCtx` equality must fire.
  it('rejects a tampered nullifierCtx (passthrough equality fires)', async () => {
    const { leafDER, leafDerLen } = buildDiiaDer(20060101);
    const ageCutoffDate = 20070101n;

    let threw = false;
    try {
      await circuit.calculateWitness(
        {
          ageQualified: 1n,
          ageCutoffDate,
          // public-slot 2 mismatched against the passthrough input below
          nullifierCtx: SYNTHETIC_NULLIFIER_CTX,
          leafTbsBytes: leafDER,
          leafTbsLen: leafDerLen,
          nullifierCtxInput: SYNTHETIC_NULLIFIER_CTX + 1n, // drift
        },
        true,
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
