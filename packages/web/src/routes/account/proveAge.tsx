// /account/prove-age — V5.4 age verification flow entry point.
//
// Spec: docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md §6.
// Plan: docs/superpowers/plans/2026-05-05-zkqes-v5_4-web.md T4 / T5.3.
//
// Phase C wiring — replaces ProveAgeFlow's `MockProver` default with a
// real Worker-hosted snarkjs prover pinned to the V5.4 AgeDiiaUA
// artifacts (wasm + zkey). URLs come from the pumped fixture
// `fixtures/circuits/age-ua-v5_4/urls.json` (sha256-pinned per the
// pre-ceremony initial-zkey commit `fef768b`).
//
// Worker reuse: the same `v5-prover.worker.ts` Worker the V5.x
// identity flows use is circuit-agnostic — it forwards
// `wasmUrl + zkeyUrl + input` per call to snarkjs, no V5.x-specific
// branching. AgeDiiaUA proves through the same protocol.
//
// `terminateAfterProve: true` releases the zkey heap after each prove,
// matching the V5.x register/rotate flows. AgeDiiaUA's zkey is much
// smaller (~50 MB pre-ceremony, ~? MB post-ceremony) than V5.x's
// ~2 GB, but the terminate-on-prove pattern stays for consistency.
//
// IMPORTANT: ProveAgeFlow's full state machine + V5.4
// `nullifierCtx = keccak256("zkqes-age-ctx-v1" || ...)` derivation
// + frozen ProtocolBytes literals are PRESERVED VERBATIM in the
// component. The route layer is composition + prover wiring only.

import { useMemo } from 'react';

import { SnarkjsWorkerProver } from '@zkqes/sdk/prover/snarkjsWorker';

import { ProveAgeFlow } from '../../components/account/ProveAgeFlow';
import { V5_4_AGE_ARTIFACTS } from '../../lib/v5_4AgeArtifacts';

export function AccountProveAgeScreen() {
  // Memoize the prover instance so React StrictMode's double-render
  // in dev doesn't spawn two Workers per mount. The Worker itself is
  // also recreated per prove call when `terminateAfterProve: true`
  // (heap release between proves) — but we still want stable identity
  // across re-renders to keep the prover prop reference-stable for
  // ProveAgeFlow's effect dependencies.
  const prover = useMemo(() => {
    const worker = new Worker(
      new URL('../../workers/v5-prover.worker.ts', import.meta.url),
      { type: 'module' },
    );
    return new SnarkjsWorkerProver({
      worker,
      terminateAfterProve: true,
    });
  }, []);

  return (
    <ProveAgeFlow
      prover={prover}
      wasmUrl={V5_4_AGE_ARTIFACTS.wasmUrl}
      zkeyUrl={V5_4_AGE_ARTIFACTS.zkeyUrl}
    />
  );
}
