// /verify — civic-terminal v2 surface (default).
//
// V2 atomic flip (Task 13, 2026-05-04): the legacy civic-monumental
// `LegacyCeremonyVerify` body — 314 lines of zkey-hash-comparison flow
// (drop a downloaded zkey, SHA-256 the file in a Web Worker, compare to
// `status.finalZkeySha256`) + the 4-way `AriaPhase` published-hash
// section from #53 — was retired with the variant gate.
//
// The 3-col `<VerifyShell />` from Task 11 is now the only renderer.
// It superset-replaces the legacy zkey-hash check via the `by attestation`
// tab (case-insensitive sha-256 lookup against
// `status.contributors[].attestation` AND `status.finalZkeySha256`).
// `by wallet` tab carries the post-pump on-chain registry-read path —
// pre-launch verdict for now per founder's "DON'T add new on-chain reads
// in Task 13" directive; wires to the registry helper when the
// post-ceremony deploy lands.
//
// History: the legacy zkey-hash flow shipped as the V5.2 Phase B
// post-ceremony sanity check. The flow's intent — "did I download the
// same zkey the verifier was deployed with" — is still served by the
// `by attestation` tab. Founder Q1 ACCEPT (2026-05-04) approved the v2
// shells as canonical; the legacy body retires here.

import { VerifyShell } from '../../components/ceremony/VerifyShell';

export function CeremonyVerify() {
  return <VerifyShell />;
}
