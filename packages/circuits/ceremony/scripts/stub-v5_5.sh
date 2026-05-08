#!/usr/bin/env bash
# V5.5 stub ceremony — single-contributor Groth16 setup against the V5.5
# main circuit (~5.605M constraints from the multi-algorithm SPKI slice
# + KeyCommitVar primitive) + pot23.  V5.5 supersedes V5.3 (ceremony/v5_3/)
# for the V5.5 amendment integration phase; V5.3 stub remains an archive
# of the pre-V5.5 ceremony.  Produces:
#
#   ceremony/v5_5/Groth16VerifierV5_5Stub.sol
#   ceremony/v5_5/zkqes-v5_5-stub.zkey            (gitignored — *.zkey)
#   ceremony/v5_5/verification_key.json
#   ceremony/v5_5/zkey.sha256
#   ceremony/v5_5/proof-sample.json             # sample proof for sanity
#   ceremony/v5_5/public-sample.json            # 21-field public inputs (V5.5 layout)
#   ceremony/v5_5/witness-input-sample.json     # sample witness JSON (round-tripped)
#
# DEV-ONLY. Same single-contributor caveat as V5.3 stub: sound IF the
# contributor is honest AND the pot23 ptau was honestly generated.
# Real Phase B ceremony (20-30 contributors per spec §13.4) is a separate
# dispatch when V5.5 is feature-complete.
#
# V5.5 amendment scope (multi-algorithm signature extension, spec
# 2026-05-07-v5_5-multi-algorithm-signature-extension.md):
#   - Drop V5.4 P-256-specific limb arrays (leafXLimbs, leafYLimbs,
#     intXLimbs, intYLimbs) + leafSpkiCommit + intSpkiCommit public
#     signals.
#   - Add SPKI slice as private input (leafSpkiBytes, leafSpkiLength,
#     leafSpkiOffsetInTbs) bounded by MAX_LEAF_SPKI=600 (covers RSA-4096).
#   - Add leafKeyCommit public signal at slot [11] (replaces V5.4
#     leafSpkiCommit), computed via KeyCommitVar primitive
#     (Poseidon-domain commitment with KEY_COMMIT_DOMAIN constant).
#   - 21-signal public layout (V5.4 was 22; intSpkiCommit dropped).
#
# Pot23 uplift rationale (spec §13.4):
#   The per-byte Multiplexer(1, MAX_LEAF_TBS=1408) used by the SPKI
#   byte-equality gate costs ~2,800 constraints/mux × 600 SPKI bytes,
#   pushing the V5.5 envelope from V5.3's 3.896M to 5.605M.  Pot22's
#   4.19M cap overflows; pot23's 8.39M cap leaves ~33% headroom.
#   Phase B contributors download 9.1 GB pot23 instead of V5.3's
#   4.6 GB pot22 — accepted trade-off for clean Poseidon-domain
#   commitment uniformity across P-256 / RSA / future algorithms.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PTAU_PATH="$PKG_DIR/build/zkqes-presentation/powersOfTau28_hez_final_23.ptau"
PTAU_URL="https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_23.ptau"
# Canonical Hermez pot23 sha256 (from circuits CLAUDE.md §V5.7).  Pinned
# so a corrupted or replaced ptau cannot silently bind the rest of the
# bundle to a malicious transcript.  Update only with a cross-checked
# hash from the Hermez ceremony manifest.
#
# Cross-check status: this is FIRST-TRUST-ON-USE — pinned against the
# downloaded file, not yet against an independent Hermez manifest source.
# Phase B ceremony (real, multi-contributor) MUST cross-validate against
# the official Hermez announcement before dispatch (spec §13.4 open Q5).
PTAU_SHA256="047f16d75daaccd6fb3f859acc8cc26ad1fb41ef030da070431e95edb126d19d"
CIRCOMLIB="$PKG_DIR/node_modules"

CIRCUIT_SRC="$PKG_DIR/circuits/ZkqesPresentationV5_5.circom"
BUILD_DIR="$PKG_DIR/build/v5_5-stub"
OUT_DIR="$PKG_DIR/ceremony/v5_5"

R1CS="$BUILD_DIR/ZkqesPresentationV5_5.r1cs"
WASM_DIR="$BUILD_DIR/ZkqesPresentationV5_5_js"
WASM="$WASM_DIR/ZkqesPresentationV5_5.wasm"

ZKEY0="$BUILD_DIR/zkqes-v5_5-stub_0000.zkey"
ZKEY="$OUT_DIR/zkqes-v5_5-stub.zkey"
VKEY="$OUT_DIR/verification_key.json"
VERIFIER="$OUT_DIR/Groth16VerifierV5_5Stub.sol"
HASH_FILE="$OUT_DIR/zkey.sha256"

PROOF_SAMPLE="$OUT_DIR/proof-sample.json"
PUBLIC_SAMPLE="$OUT_DIR/public-sample.json"
INPUT_SAMPLE="$OUT_DIR/witness-input-sample.json"
WTNS_SAMPLE="$BUILD_DIR/witness-sample.wtns"

mkdir -p "$BUILD_DIR" "$OUT_DIR" "$(dirname "$PTAU_PATH")"

# Manifest invariant: `zkey.sha256` only exists after the script
# completes end-to-end.  Any partial/aborted run leaves no manifest, so
# `sha256sum -c ceremony/v5_5/zkey.sha256` will fail-loud (file missing)
# rather than silently validate a stale bundle.  Per-cascade pre-wipes
# below handle the success-path "downstream artifacts came from a
# different upstream" class of bugs; this top-of-script wipe handles
# the "downstream regeneration partially failed" class.
rm -f "$HASH_FILE"

# ---------- 1. pot23 fetch ----------
# Top of the dependency chain: a replaced/corrupted pot23 transcript
# would silently bind the rest of the bundle to the old ceremony.  When
# the ptau is re-fetched, we cascade-invalidate everything that derives
# from `groth16 setup` (zkey0 + all descendants).
#
# Atomic download: curl writes to a sibling tempfile, then publishes
# only after a downstream sha256 check.  This handles partial-download
# corruption (network drop).  Cascade-wipe runs BEFORE the download so
# a stale downstream bundle cannot falsely validate.
if [[ ! -f "$PTAU_PATH" ]]; then
  rm -f "$ZKEY0" "$ZKEY" "$VKEY" "$VERIFIER" \
        "$PROOF_SAMPLE" "$PUBLIC_SAMPLE" "$INPUT_SAMPLE" "$WTNS_SAMPLE"
  echo "[ptau] pot23 missing; downloading from Hermez S3 (~9.1 GB)..."
  PTAU_TMP="$(mktemp "${PTAU_PATH}.XXXXXX")"
  trap 'rm -f "$PTAU_TMP"' EXIT
  curl -fSL --progress-bar -o "$PTAU_TMP" "$PTAU_URL"
  # Verify BEFORE publishing.  A bad download is caught here and the
  # tempfile is auto-removed by the EXIT trap, leaving no poisoned
  # cache at $PTAU_PATH.
  echo "[ptau] verifying downloaded sha256 against pinned Hermez transcript..."
  echo "${PTAU_SHA256}  ${PTAU_TMP}" | sha256sum -c -
  mv "$PTAU_TMP" "$PTAU_PATH"
  trap - EXIT
fi

# Unconditional sha256 verification on every invocation.  Catches:
#   (a) post-download corruption (disk bit-rot, host filesystem error),
#   (b) supply-chain swap (someone replaced the local file after a
#       previous successful download),
#   (c) a pre-existing $PTAU_PATH that doesn't match the pin (e.g., an
#       older Hermez transcript inherited from somewhere).
# A failure here aborts the script before any downstream artifact is
# produced.  Combined with the top-of-script `rm -f $HASH_FILE`, no
# stale manifest can survive.
echo "[ptau] verifying cached sha256 against pinned Hermez transcript..."
echo "${PTAU_SHA256}  ${PTAU_PATH}" | sha256sum -c -
echo "[ptau] $(du -h "$PTAU_PATH" | cut -f1)  $PTAU_PATH"

# ---------- 2. Compile circuit (cold compile pattern; cascades if rebuilt) ----------
# CLAUDE.md V5.3 cold-compile pattern: direct `circom --r1cs --wasm` to
# avoid `circom_tester.wasm()`'s 2× memory overhead.  Compile cache
# guard requires BOTH `.r1cs` AND `.wasm` (+ generate_witness.js) so a
# half-compiled cache won't pass through to step 6 with a confusing
# "ENOENT generate_witness.js" failure.  When the R1CS is rebuilt, all
# downstream artifacts are wiped first.  V5.5 cold compile is heavier
# than V5.3 (~5.6M vs ~3.9M constraints) — budget ~6-8 min wall + ~20 GB
# RSS.
if [[ ! -f "$R1CS" || ! -f "$WASM" || ! -f "$WASM_DIR/generate_witness.js" ]]; then
  rm -f "$ZKEY0" "$ZKEY" "$VKEY" "$VERIFIER" \
        "$PROOF_SAMPLE" "$PUBLIC_SAMPLE" "$INPUT_SAMPLE" "$WTNS_SAMPLE"
  echo "[circom] cold compile of V5.5 circuit (~6-8 min, ~20 GB RSS)..."
  circom "$CIRCUIT_SRC" --r1cs --wasm \
    -l "$PKG_DIR/circuits" -l "$CIRCOMLIB" -o "$BUILD_DIR/"
fi

# Sanity: confirm the compiled R1CS reports the V5.5 envelope.  V5.5
# spec target: ≤6,000,000 constraints (pot23 capacity 8,388,608).  We
# measured 5,604,985 in the foundation arc cold-compile.  Drift > 200K
# constraints without a spec amendment is a hard stop — the soundness
# story changes (and may push toward pot24).
echo "[r1cs] info:"
NODE_OPTIONS='--max-old-space-size=24576' \
  pnpm exec snarkjs r1cs info "$R1CS"

# ---------- 3. Groth16 setup (zkey0) ----------
# When zkey0 is regenerated, all descendants are wiped before the
# heavy `snarkjs groth16 setup` runs.  V5.5's larger ptau + circuit
# stretches Phase 2 init: budget ~25-35 min wall + ~40 GB peak RSS
# (vs V5.3's ~10-15 min + ~30 GB).
if [[ ! -f "$ZKEY0" ]]; then
  rm -f "$ZKEY" "$VKEY" "$VERIFIER" \
        "$PROOF_SAMPLE" "$PUBLIC_SAMPLE" "$INPUT_SAMPLE" "$WTNS_SAMPLE"
  echo "[snarkjs] groth16 setup (Phase 2 init from pot23 ~25-35 min wall, ~40 GB peak RSS)..."
  NODE_OPTIONS='--max-old-space-size=46080' \
    pnpm exec snarkjs groth16 setup "$R1CS" "$PTAU_PATH" "$ZKEY0"
fi

# ---------- 4. Single-contributor entropy ----------
# Single-contributor zkey contribute. Re-runs are guarded so the
# ceremony bundle stays bytewise-stable across invocations: re-running
# with all artifacts cached republishes the manifest from the existing
# files without minting fresh entropy.
#
# When the contribution IS regenerated, every downstream artifact
# (vkey, Solidity verifier, witness JSON, proof, public signals) is
# wiped first so the per-step guards below re-trigger.  V5.5 contribute
# wall scales with L+M+H section size (~3 GB zkey at 5.6M constraints);
# expect ~8-12 min vs V5.3's 5-7 min.
if [[ ! -f "$ZKEY" ]]; then
  rm -f "$VKEY" "$VERIFIER" "$PROOF_SAMPLE" "$PUBLIC_SAMPLE" "$INPUT_SAMPLE" "$WTNS_SAMPLE"
  echo "[snarkjs] zkey contribute (single contributor — DEV ONLY)..."
  ENTROPY="$(head -c 64 /dev/urandom | base64 | tr -d '\n')"
  NODE_OPTIONS='--max-old-space-size=46080' \
    pnpm exec snarkjs zkey contribute "$ZKEY0" "$ZKEY" \
      --name="zkqes-v5_5-stub-dev-1" -v -e="$ENTROPY"
fi

# ---------- 5. Export verification key + Solidity verifier ----------
if [[ ! -f "$VKEY" ]]; then
  echo "[snarkjs] export verification key..."
  pnpm exec snarkjs zkey export verificationkey "$ZKEY" "$VKEY"
fi
if [[ ! -f "$VERIFIER" ]]; then
  echo "[snarkjs] export Solidity verifier..."
  pnpm exec snarkjs zkey export solidityverifier "$ZKEY" "$VERIFIER"
  # snarkjs emits the contract as `Groth16Verifier`; rename to
  # `Groth16VerifierV5_5Stub` so contracts-eng can `import` it
  # alongside earlier version stubs without name collision.  The eventual
  # production verifier will be named `Groth16VerifierV5_5` (no Stub
  # suffix) and have the same ABI (uint[21] public inputs).
  sed -i 's/contract Groth16Verifier/contract Groth16VerifierV5_5Stub/' "$VERIFIER"
fi

# ---------- 6. Sample witness + proof + verify (round-trip) ----------
# Uses the V5.5 witness builder at packages/sdk/src/witness/v5_5/
# rather than the V5.x circuits-package builder — V5.5 builder lives
# in @zkqes/sdk because it composes the SDK's V5.4 builder.  We
# require the SDK to be built (or at minimum ts-node-resolvable) from
# this script's vantage; @zkqes/sdk is a workspace dep and resolves
# via pnpm-workspace.
#
# The synth-CAdES helper produces a binding-bound CMS over the
# admin-ecdsa fixture (synthetic SEC1-uncompressed pk = 0x04 ||
# 0x11×32 || 0x22×32) — same as V5.3.  buildWitnessV5_5 emits the
# V5.5 witness layout (21 public signals + leafSpkiBytes/Length/Offset
# private inputs); we feed the witness JSON to generate_witness.js,
# generate the binary .wtns, then snarkjs.groth16.prove + verify
# round-trip.
if [[ ! -f "$INPUT_SAMPLE" ]]; then
  echo "[witness] generating sample witness JSON via build-witness-v5_5 (SDK)..."
  # Builder lives in @zkqes/sdk (workspace dep, ts-node-resolvable).
  # Fixtures come from THIS package — circuits owns the canonical
  # admin-ecdsa fixture set including synth-intermediate.der.  The
  # synth-cades helper exists in BOTH packages; we use SDK's because
  # it is the one the V5.5 builder pipeline composes against.
  SDK_DIR="$PKG_DIR/../sdk"
  pnpm exec ts-node --transpile-only -e '
      const { readFileSync, writeFileSync } = require("node:fs");
      const { resolve } = require("node:path");
      const { createHash } = require("node:crypto");
      const { buildWitnessV5_5 } = require("'"$SDK_DIR"'/src/witness/v5_5/build-witness-v5_5");
      const { buildSynthCades } = require("'"$PKG_DIR"'/test/helpers/build-synth-cades");
      const fixtureDir = resolve("'"$PKG_DIR"'/fixtures/integration/admin-ecdsa");
      const bindingBytes = readFileSync(resolve(fixtureDir, "binding.zkqes2.json"));
      const leafCertDer  = readFileSync(resolve(fixtureDir, "leaf.der"));
      const intCertDer   = readFileSync(resolve(fixtureDir, "synth-intermediate.der"));
      const leafSpki     = readFileSync(resolve(fixtureDir, "leaf-spki.bin"));
      const intSpki      = readFileSync(resolve(fixtureDir, "intermediate-spki.bin"));
      const bindingDigest = createHash("sha256").update(bindingBytes).digest();
      const cades = buildSynthCades({ contentDigest: bindingDigest, leafCertDer, intCertDer });
      (async () => {
        const witness = await buildWitnessV5_5({
          bindingBytes,
          leafCertDer,
          leafSpki, intSpki,
          signedAttrsDer: cades.signedAttrsDer,
          signedAttrsMdOffset: cades.signedAttrsMdOffset,
          walletSecret: Buffer.alloc(32, 0x42),
        });
        writeFileSync("'"$INPUT_SAMPLE"'", JSON.stringify(witness, null, 2));
      })().catch((e) => { console.error(e); process.exit(1); });
    '
fi

if [[ ! -f "$WTNS_SAMPLE" ]]; then
  echo "[witness] generating .wtns via $WASM_DIR/generate_witness.js..."
  node "$WASM_DIR/generate_witness.js" "$WASM" "$INPUT_SAMPLE" "$WTNS_SAMPLE"
fi

if [[ ! -f "$PROOF_SAMPLE" || ! -f "$PUBLIC_SAMPLE" ]]; then
  echo "[snarkjs] groth16 prove (sample, ~120s wall, ~36 GB peak RSS)..."
  NODE_OPTIONS='--max-old-space-size=46080' \
    pnpm exec snarkjs groth16 prove "$ZKEY" "$WTNS_SAMPLE" "$PROOF_SAMPLE" "$PUBLIC_SAMPLE"

  # Sanity: round-trip verify.
  echo "[snarkjs] groth16 verify (sample)..."
  pnpm exec snarkjs groth16 verify "$VKEY" "$PUBLIC_SAMPLE" "$PROOF_SAMPLE"
fi

# Sanity: V5.5 must have exactly 21 public signals (V5.4 was 22; V5.5
# drops intSpkiCommit and renames leafSpkiCommit → leafKeyCommit).
PS_LEN="$(NODE_OPTIONS='--max-old-space-size=4096' pnpm exec node -e "console.log(JSON.parse(require('fs').readFileSync('$PUBLIC_SAMPLE','utf8')).length)")"
if [[ "$PS_LEN" != "21" ]]; then
  echo "[FATAL] V5.5 public-signal count mismatch: got $PS_LEN, expected 21"
  exit 1
fi
echo "[ok] public signals length = 21 (V5.5 layout — leafKeyCommit replaces leafSpkiCommit + intSpkiCommit dropped)"

# ---------- 7. Atomic manifest write ----------
# Repo-relative paths so `sha256sum -c zkey.sha256` round-trips on any
# checkout (cd to packages/circuits first).  Using absolute paths would
# pin the manifest to this exact host layout.
#
# Atomic write: sha256sum redirects to a tmp file in the same dir, then
# mv into place ONLY on full success.  Status output BEFORE the manifest
# becomes visible reads from $HASH_TMP rather than $HASH_FILE so a
# SIGPIPE / I/O error during these final prints aborts under set -e
# WITHOUT leaving a stale manifest on disk.  The atomic mv at the very
# end of the script is therefore the strict success-marker:
# zkey.sha256 exists ⇔ this run reached the last line of the script.
echo "[manifest] artifact sha256 (repo-relative paths, atomic write)..."
HASH_TMP="$(mktemp "${HASH_FILE}.XXXXXX")"
trap 'rm -f "$HASH_TMP"' EXIT
(
  cd "$PKG_DIR"
  sha256sum \
    "ceremony/v5_5/zkqes-v5_5-stub.zkey" \
    "ceremony/v5_5/verification_key.json" \
    "ceremony/v5_5/Groth16VerifierV5_5Stub.sol" \
    "build/v5_5-stub/ZkqesPresentationV5_5.r1cs" \
    "ceremony/v5_5/proof-sample.json" \
    "ceremony/v5_5/public-sample.json" \
    "ceremony/v5_5/witness-input-sample.json"
) > "$HASH_TMP"
cat "$HASH_TMP"

echo
echo "=== V5.5 STUB CEREMONY COMPLETE ==="
echo "  Verifier .sol:         $VERIFIER"
echo "  zkey:                  $ZKEY  (gitignored)"
echo "  verification key:      $VKEY"
echo "  sample proof:          $PROOF_SAMPLE"
echo "  sample public (21):    $PUBLIC_SAMPLE"
echo "  sample witness JSON:   $INPUT_SAMPLE"
echo "  hashes:                $HASH_FILE"
echo
echo "Hand $VERIFIER to contracts-eng for the V5.5 register/rotateWallet integration."
echo "Pump $VKEY + $PROOF_SAMPLE + $PUBLIC_SAMPLE + $INPUT_SAMPLE to web-eng SDK fixtures."

# Final commit: atomic publish of the integrity manifest.  Must remain
# the LAST writable side-effect in this script — no statement after this
# line.  The EXIT trap stays armed but its `rm -f $HASH_TMP` is a no-op
# now that $HASH_TMP was renamed to $HASH_FILE.  Manifest invariant:
# `zkey.sha256` exists ⇔ this `mv` succeeded.
mv "$HASH_TMP" "$HASH_FILE"
