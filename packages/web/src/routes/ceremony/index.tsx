// /ceremony — civic-terminal v2 surface (default).
//
// V2 atomic flip (Task 13, 2026-05-04): the legacy civic-monumental
// `LegacyCeremonyIndex` body + `?variant=civic-terminal` URL gate were
// deleted in this commit. The 3-col `<CeremonyShell />` from Task 6 is
// now the only renderer. Spec §4 / plan Task 6 / orchestration §8.
//
// History: the legacy body shipped pre-v2 as the civic-monumental
// document landing for `/ceremony` (recruitment + nav + DocumentFooter).
// Task 6's `?variant=civic-terminal` gate kept it as the default during
// founder review; founder Q1 ACCEPT (2026-05-04) approved the v2 shells
// as canonical, so the legacy body retires here.

import { CeremonyShell } from '../../components/ceremony/CeremonyShell';

export function CeremonyIndex() {
  return <CeremonyShell />;
}
