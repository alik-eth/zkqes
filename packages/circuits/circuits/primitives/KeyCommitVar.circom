pragma circom 2.1.9;

// V5.5 KeyCommitVar — algorithm-agnostic SPKI commitment.
//
// Spec: docs/superpowers/specs/2026-05-07-v5_5-multi-algorithm-signature-extension.md
//   §5.3 (generic commitment surface)
//   §7.4 (Circom KeyCommitVar primitive — this file)
//
// Construction (frozen across TS / Circom / Solidity):
//
//   commit = Poseidon2( KEY_COMMIT_DOMAIN,
//                       PoseidonChunkHashVarT7(bytes, len) )
//
// Three byte-identical implementations MUST exist:
//   - packages/sdk/src/witness/v5_5/key-commit.ts             (TS reference)
//   - packages/contracts/src/libs/KeyCommit.sol               (on-chain)
//   - this file                                               (in-circuit)
//
// Parity fixture: fixtures/v5_5/key-commit-parity.json (10 vectors).
// KeyCommitVar.test.ts (test/primitives/) parity-tests this template
// against the same fixture used by SDK + contracts tests.
//
// ---------------------------------------------------------------------
// Why a NEW chunk-hash variant (T7 instead of V5.4's T16)?
//
// V5.4's PoseidonChunkHashVar uses RATE=15 (Poseidon-T16 per round).
// Solidity has hashT7 deployed via PoseidonBytecode but no hashT16 —
// adding T16 means deploying a new opaque bytecode contract + extending
// the reproducibility-check gate. Avoidable.
//
// T7 (RATE=5, CAPACITY=1) uses Poseidon-6 per round. Solidity already
// owns hashT7 (arity 6→1), so on-chain KeyCommit reuses it in a loop.
//
// V5.4's PoseidonChunkHashVar (RATE=15) stays untouched (still used by
// canonicalizeCertHash + V5.4 nullifier derivation). V5.5 introduces
// this PARALLEL primitive — additive, not breaking.
//
// Sponge sizing for V5.5:
//   MAX_LEAF_SPKI = 600 bytes (covers RSA-4096 SPKI ~ 550 bytes + headroom)
//   N_CHUNKS_MAX  = ⌈600 / 31⌉  = 20
//   N_FE_MAX      = N_CHUNKS_MAX + 1 = 21  (chunks ‖ length)
//   N_ROUNDS_MAX  = ⌈21 / 5⌉ = 5
//
// In practice:
//   - P-256 named-curve SPKI (91 bytes) → 4 fe → 1 round
//   - RSA-2048 SPKI (~294 bytes) → 11 fe → 3 rounds
//   - RSA-3072 SPKI (~414 bytes) → 15 fe → 3 rounds
//   - RSA-4096 SPKI (~550 bytes) → 19 fe → 4 rounds
//
// ---------------------------------------------------------------------
// KEY_COMMIT_DOMAIN — frozen field constant.
//
//   bigint(keccak256("zkqes-key-commit-v1")) mod p_bn254
// = 18645781269818968495274020647839177040876380151358417993861915365514852958754
//
// The string "zkqes-key-commit-v1" is a frozen ProtocolBytes literal
// (CLAUDE.md §"ProtocolBytes invariant"); never renamed across versions.
// The reduced field value is hardcoded below + pinned by the parity
// fixture's `domainConstant` field. If the constant ever drifts,
// KeyCommit.sol + key-commit.ts MUST move in lockstep.

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// =====================================================================
// PoseidonChunkHashVarT7 — variable-length chunk hash (RATE=5).
//
// Structurally identical to PoseidonChunkHashVar except RATE=5 and the
// per-round Poseidon arity is 6. Same chunk-packing convention (31-byte
// big-endian chunks; last chunk packs only its real bytes; length
// appended as final fe). Same conditional-mux pattern for variable
// round count.
// =====================================================================
template PoseidonChunkHashVarT7(MAX_BYTES) {
    var CHUNK = 31;
    var RATE = 5;
    var N_CHUNKS_MAX = (MAX_BYTES + CHUNK - 1) \ CHUNK;
    var N_FE_MAX = N_CHUNKS_MAX + 1;
    var N_ROUNDS_MAX = (N_FE_MAX + RATE - 1) \ RATE;
    var TOTAL_SLOTS = N_ROUNDS_MAX * RATE;

    signal input bytes[MAX_BYTES];
    signal input len;
    signal output out;

    // -- 1. Range-check len.
    component lenBound = LessEqThan(16);
    lenBound.in[0] <== len;
    lenBound.in[1] <== MAX_BYTES;
    lenBound.out === 1;

    // -- 2. nChunks := ⌈len / 31⌉, pinned by 31*nChunks ∈ [len, len+31).
    signal nChunks;
    nChunks <-- (len + CHUNK - 1) \ CHUNK;

    component nLo = GreaterEqThan(16);
    nLo.in[0] <== CHUNK * nChunks;
    nLo.in[1] <== len;
    nLo.out === 1;
    component nHi = LessThan(16);
    nHi.in[0] <== CHUNK * nChunks;
    nHi.in[1] <== len + CHUNK;
    nHi.out === 1;

    // -- 3. Per-chunk packing with case flags + Horner active-mask.
    signal bytesPadded[N_CHUNKS_MAX * CHUNK];
    for (var k = 0; k < MAX_BYTES; k++) bytesPadded[k] <== bytes[k];
    for (var k = MAX_BYTES; k < N_CHUNKS_MAX * CHUNK; k++) bytesPadded[k] <== 0;

    signal lastLenAtC[N_CHUNKS_MAX];
    signal fullChunk[N_CHUNKS_MAX];
    signal partialChunk[N_CHUNKS_MAX];
    signal zeroChunk[N_CHUNKS_MAX];
    component lbChunk[N_CHUNKS_MAX];
    component cmpFull[N_CHUNKS_MAX];
    component cmpZero[N_CHUNKS_MAX];
    component activeByte[N_CHUNKS_MAX][CHUNK];
    signal acc[N_CHUNKS_MAX][CHUNK + 1];
    signal chunks[N_CHUNKS_MAX];

    for (var c = 0; c < N_CHUNKS_MAX; c++) {
        // Exclusive case flags.
        fullChunk[c] <-- (len >= (c + 1) * CHUNK) ? 1 : 0;
        partialChunk[c] <-- (len >= c * CHUNK && len < (c + 1) * CHUNK) ? 1 : 0;
        zeroChunk[c] <-- (len < c * CHUNK) ? 1 : 0;
        fullChunk[c] * (fullChunk[c] - 1) === 0;
        partialChunk[c] * (partialChunk[c] - 1) === 0;
        zeroChunk[c] * (zeroChunk[c] - 1) === 0;
        fullChunk[c] + partialChunk[c] + zeroChunk[c] === 1;

        cmpFull[c] = GreaterEqThan(16);
        cmpFull[c].in[0] <== len;
        cmpFull[c].in[1] <== (c + 1) * CHUNK;
        cmpFull[c].out === fullChunk[c];

        cmpZero[c] = LessThan(16);
        cmpZero[c].in[0] <== len;
        cmpZero[c].in[1] <== c * CHUNK;
        cmpZero[c].out === zeroChunk[c];

        lastLenAtC[c] <== fullChunk[c] * CHUNK + partialChunk[c] * (len - c * CHUNK);

        lbChunk[c] = LessEqThan(8);
        lbChunk[c].in[0] <== lastLenAtC[c];
        lbChunk[c].in[1] <== CHUNK;
        lbChunk[c].out === 1;

        acc[c][0] <== 0;
        for (var j = 0; j < CHUNK; j++) {
            activeByte[c][j] = LessThan(8);
            activeByte[c][j].in[0] <== j;
            activeByte[c][j].in[1] <== lastLenAtC[c];
            // active ? acc*256 + byte : acc
            acc[c][j + 1] <== acc[c][j]
                + activeByte[c][j].out * (acc[c][j] * 255 + bytesPadded[c * CHUNK + j]);
        }
        chunks[c] <== acc[c][CHUNK];
    }

    // -- 4. Assemble fe[] via per-slot IsEqual/LessThan against nChunks.
    component feEq[TOTAL_SLOTS];
    component feLt[TOTAL_SLOTS];
    signal feChunkProd[TOTAL_SLOTS];
    signal feLenProd[TOTAL_SLOTS];
    signal fe[TOTAL_SLOTS];
    for (var i = 0; i < TOTAL_SLOTS; i++) {
        feEq[i] = IsEqual();
        feEq[i].in[0] <== i;
        feEq[i].in[1] <== nChunks;

        feLt[i] = LessThan(16);
        feLt[i].in[0] <== i;
        feLt[i].in[1] <== nChunks;

        if (i < N_CHUNKS_MAX) {
            feChunkProd[i] <== feLt[i].out * chunks[i];
        } else {
            feChunkProd[i] <== 0;
        }
        feLenProd[i] <== feEq[i].out * len;
        fe[i] <== feChunkProd[i] + feLenProd[i];
    }

    // -- 5. Gated sponge. nRounds = ⌈(nChunks+1) / 5⌉.
    signal nRounds;
    nRounds <-- (nChunks + 1 + RATE - 1) \ RATE;
    component rLo = GreaterEqThan(16);
    rLo.in[0] <== RATE * nRounds;
    rLo.in[1] <== nChunks + 1;
    rLo.out === 1;
    component rHi = LessThan(16);
    rHi.in[0] <== RATE * nRounds;
    rHi.in[1] <== nChunks + 1 + RATE;
    rHi.out === 1;

    component round[N_ROUNDS_MAX];
    component active[N_ROUNDS_MAX];
    signal stateAfter[N_ROUNDS_MAX + 1];
    signal roundActive[N_ROUNDS_MAX];
    signal roundKeep[N_ROUNDS_MAX];
    stateAfter[0] <== 0;
    for (var r = 0; r < N_ROUNDS_MAX; r++) {
        round[r] = Poseidon(6);    // arity = RATE + 1
        round[r].inputs[0] <== stateAfter[r];
        for (var j = 0; j < RATE; j++) {
            round[r].inputs[1 + j] <== fe[r * RATE + j];
        }
        active[r] = LessThan(16);
        active[r].in[0] <== r;
        active[r].in[1] <== nRounds;

        roundActive[r] <== active[r].out * round[r].out;
        roundKeep[r] <== (1 - active[r].out) * stateAfter[r];
        stateAfter[r + 1] <== roundActive[r] + roundKeep[r];
    }

    out <== stateAfter[N_ROUNDS_MAX];
}

// =====================================================================
// KeyCommitVar — V5.5 algorithm-agnostic SPKI commitment.
//
// Wraps PoseidonChunkHashVarT7 with a Poseidon-2 outer step using the
// frozen KEY_COMMIT_DOMAIN constant. Intended call site: V5.5 main
// circuit's leaf-block, after the leaf-SPKI slice is extracted from
// leafTbsBytes (spec §7.3 byte-equality gate).
// =====================================================================
template KeyCommitVar(MAX_BYTES) {
    signal input bytes[MAX_BYTES];
    signal input len;
    signal output commit;

    // KEY_COMMIT_DOMAIN: keccak256("zkqes-key-commit-v1") mod p_bn254.
    var KEY_COMMIT_DOMAIN = 18645781269818968495274020647839177040876380151358417993861915365514852958754;

    component inner = PoseidonChunkHashVarT7(MAX_BYTES);
    inner.bytes <== bytes;
    inner.len <== len;

    component outer = Poseidon(2);
    outer.inputs[0] <== KEY_COMMIT_DOMAIN;
    outer.inputs[1] <== inner.out;

    commit <== outer.out;
}
