// PreviewModeBanner — emitted on /register, /account/rotate, /verify
// whenever phase ≠ live.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 7.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §5.4.
//
// Conservative emit policy: when `phase === null` (the hook hasn't
// resolved or the feed failed) we still render the banner. Refusing to
// claim we're in live state without proof is the right default for a
// production-trust gate.
//
// Frozen marketer-locked copy from BRAND.md v2-amendment §Frozen marketer-
// locked copy / plan §0.1 — do not rephrase.

import { useCeremonyPhase } from '../../hooks/useCeremonyPhase';

const PREVIEW_COPY =
  'PREVIEW MODE — ceremony in progress · verifications use stub verifier · proofs are NOT trusted for production';

export function PreviewModeBanner() {
  const { phase } = useCeremonyPhase();
  if (phase === 'live') return null;
  return (
    <div
      role="status"
      className="ct-tag--warn"
      style={{
        padding: '12px var(--ct-pad)',
        fontFamily: 'var(--mono)',
        fontSize: '13px',
        textAlign: 'center',
      }}
    >
      ◐ {PREVIEW_COPY}
    </div>
  );
}
