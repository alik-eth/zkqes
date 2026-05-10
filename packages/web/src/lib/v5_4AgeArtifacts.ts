// V5.4 — AgeDiiaUA prover artifact pins.
//
// Source-of-truth: `fixtures/circuits/age-ua-v5_4/urls.json` (pumped
// from circuits-eng's `feat/v5_4-circuits` at `a4a14f2`). The repo-root
// fixture file isn't directly importable from `packages/web/` under
// our current Vite config (no path alias to repo-root fixtures); the
// V5.x analogous module (`lib/circuitArtifacts.ts`) takes the same
// approach with hardcoded string constants + post-ceremony pump
// commits.
//
// Refresh procedure when post-Phase-B-ceremony URLs land:
//   1. circuits-eng publishes the FINAL .zkey + verifierSolSha256 to
//      `fixtures/circuits/age-ua-v5_4/urls.json` (repo root).
//   2. Lead pumps to web worktree.
//   3. Update the constants below to match — bump the source-pin
//      commit reference + uploadedAt + sha256s.
//   4. Same pump triggers a fresh ZKQESRegistryUA redeploy
//      (immutable verifier swap per spec §6); update
//      `ZKQES_REGISTRY_UA.baseSepolia.address` in `deployments.ts`.
//
// Pre-ceremony state today: stub-verifier-compatible initial zkey.
// `verifierKind === 'stub'` per `ZKQES_REGISTRY_UA.baseSepolia` —
// the deployed registry's stub-verifier accepts any well-formed
// proof, so the initial zkey suffices for end-to-end smoke tests.

/**
 * V5.4 AgeDiiaUA prover artifacts. Source-pinned at circuits-eng
 * `fef768b` (`fixtures/circuits/age-ua-v5_4/urls.json`).
 */
export interface V5_4AgeArtifacts {
  readonly wasmUrl: string;
  readonly zkeyUrl: string;
  readonly vkeyUrl: string;
  readonly wasmSha256: string;
  readonly zkeySha256: string;
  readonly publicSignals: 3;
  /** Pre-ceremony: 'initial' / 'stub-compatible'. Post-ceremony:
   *  'final' / 'real-verifier-compatible'. Drives UI "ceremony status"
   *  hints; not consumed by the prover itself. */
  readonly ceremonyPhase: 'initial' | 'final';
}

// Local-dev env overrides — point at on-disk stub artifacts served by
// vite under `/local-zkey/age.{wasm,zkey}`. Mirrors the V5 artifacts
// pattern in `circuitArtifacts.ts`.
const env = (typeof import.meta !== 'undefined' ? import.meta.env : undefined) as
  | Record<string, string | undefined>
  | undefined;

// Sha256-derived cache-buster suffix. snarkjs.groth16.fullProve passes
// URLs straight to the browser fetch (NOT through the SDK's
// sha256-verified CacheStorage layer), so a stale opaque-CORS response
// cached pre-CORS-fix gets served as empty bytes and snarkjs throws
// 'wasm validation error: at offset 4: failed to match magic number'.
// Appending the first 8 sha chars to the URL short-circuits the
// stale-cache hit without sacrificing the cache benefit on repeat
// loads (same sha → same URL → cache hit).
const wasmSha = env?.VITE_V5_4_AGE_WASM_SHA256 || '8322c9c527a7ed371ce81604180be98dceb033fb0be1ec87d6609093ccf55a56';
const zkeySha = env?.VITE_V5_4_AGE_ZKEY_SHA256 || '919b87a856bc2afd7facecc9a24f988e5c5bd58440c86778ba48be9a97ba7b38';
const wasmBase = env?.VITE_V5_4_AGE_WASM_URL || 'https://prove.zkqes.org/age-ua-v5_4/AgeDiiaUA.wasm';
const zkeyBase = env?.VITE_V5_4_AGE_ZKEY_URL || 'https://prove.zkqes.org/age-ua-v5_4/age-ua-v5_4-initial.zkey';

export const V5_4_AGE_ARTIFACTS: V5_4AgeArtifacts = {
  wasmUrl: `${wasmBase}?v=${wasmSha.slice(0, 8)}`,
  zkeyUrl: `${zkeyBase}?v=${zkeySha.slice(0, 8)}`,
  vkeyUrl: '', // TBD post-vkey-export per fixture metadata
  wasmSha256: wasmSha,
  zkeySha256: zkeySha,
  publicSignals: 3,
  ceremonyPhase: 'initial',
};
