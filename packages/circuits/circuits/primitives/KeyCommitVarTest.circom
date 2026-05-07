pragma circom 2.1.9;

include "./KeyCommitVar.circom";

// Test wrapper for KeyCommitVar(600). MAX_BYTES=600 covers RSA-4096
// SPKIs with headroom; matches packages/sdk/src/witness/v5_5/key-commit.ts
// MAX_LEAF_SPKI constant. The 600-byte form exercises the full sponge
// gate machinery (up to 5 rounds), with shorter inputs validating the
// single-round, two-round, etc. paths via the conditional-mux.
component main = KeyCommitVar(600);
