# Trusted setup ceremony

> **Renamed 2026-05-03** — see [`docs/superpowers/specs/2026-05-03-zkqes-rename-design.md`](2026-05-03-zkqes-rename-design.md) for the rename baseline. Historical references to QKB/QIE/Identity-Escrow in pre-2026-05-03 commits remain immutable in git history.

`zkqes` uses a Groth16 SNARK; Groth16 requires a structured reference string produced by a multi-party trusted setup. Phase 1 reuses the public Hermez Powers of Tau; Phase 2 is per-circuit and is run as a coordinator-driven multi-contributor chain. So long as one contributor honestly destroys their entropy, the resulting proving key is sound — no contributor needs to trust any other.

This page is the developer-side reference. The contributor-facing coordination surface — round-by-round chain, attestation log, paste-attestation verifier, recruitment paths — lives on the project landing at [`zkqes.org/ceremony`](https://zkqes.org/ceremony).

## Phase 1 — universal

`powersOfTau28_hez_final_22.ptau` (Hermez Phase 1, 2²² = 4.19M-constraint cap). SHA-256 pinned in `packages/circuits/ceremony/scripts/setup.sh`. Already public, already audited; no new Phase 1 is required.

## Phase 2 — per-circuit, multi-contributor

The Phase B ceremony runs 5-10 contributors against the V5.2 / V5.3 circuit. Each contributor:

1. Downloads the previous round's intermediate `.zkey` from the coordinator. Artifacts are R2-backed under `prove.zkqes.org/ceremony/`.
2. Runs `snarkjs zkey contribute` locally with their own entropy. Roughly twenty minutes wall time on a 32 GB-RAM machine; approximately 30 GB peak memory.
3. Verifies the output locally before uploading.
4. Uploads via a single-use signed URL issued by the coordinator.

A public beacon — a future Ethereum block hash — is applied as the final entropy injection after the last contributor lands. The beacon binds the final `.zkey` to a public timestamp that no participant could grind.

## Attestation chain

Every round publishes a contributor handle, an attestation hash, and the image digest of the build environment used to run the contribution. The chain is consumed live by `zkqes.org/ceremony` and is independently verifiable via `snarkjs zkey verify` against the previous round's `.zkey`. The full transcript lives at `packages/circuits/ceremony/contributions/`.

## Production deployment

A Phase B ceremony output is the prerequisite for any production-qualified deployment. The flow:

1. Final round and beacon land.
2. The auto-generated Solidity verifier (`Groth16VerifierV5_*.sol`) replaces the in-tree stub at `packages/contracts/src/`.
3. Contracts redeploy on Base Sepolia — and, post-audit, on Base mainnet — with the real verifier address pumped to `fixtures/contracts/<network>.json`.
4. The frontend phase flips from `ceremony-live` to `live`; the registry switches from the stub verifier to the real one.

See the [V5 architecture spec](/specs/v5-architecture) §11 for the full Phase 2 contract.

## Contributing a round

Recruitment is coordinator-driven. If you maintain ZK infrastructure — PSE, 0xPARC, Mopro, Anon Aadhaar, Polygon ID, or a research lab in the same lineage — and would like to attest a round, reach out via the project's social channels. The four-command contributor flow plus the hardware requirements are documented at [`zkqes.org/ceremony/contribute`](https://zkqes.org/ceremony/contribute).
