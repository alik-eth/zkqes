// /account/prove-age — V5.4 age verification flow entry point.
//
// Spec: docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md §6.
// Plan: docs/superpowers/plans/2026-05-05-zkqes-v5_4-web.md T4.
//
// Phase A skeleton — composes the v3 `<ProveAgeFlow />` with its
// default `MockProver`. T5 (Phase C) wires the real Worker-hosted
// snarkjs prover + the binding picker reading on-chain `getBinding()`
// against deployed `ZKQES_REGISTRY_UA`, and the on-chain
// `IZKQESRegistry::proveAge` writeContract submission.
//
// IMPORTANT: ProveAgeFlow's full state machine + V5.4
// `nullifierCtx = keccak256("zkqes-age-ctx-v1" || ...)` derivation
// + frozen ProtocolBytes literals are PRESERVED VERBATIM in the
// component. The route is composition-only — no logic here.

import { ProveAgeFlow } from '../../components/account/ProveAgeFlow';

export function AccountProveAgeScreen() {
  return <ProveAgeFlow />;
}
