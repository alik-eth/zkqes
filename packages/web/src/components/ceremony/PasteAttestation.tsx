// PasteAttestation — /ceremony right-column membership-verify widget.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 6.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §4.4.
//
// Looks up a pasted attestation hash against the published contributor list
// and reports the matching round + contributor (or "not part of this
// ceremony"). This is membership + ordering verification, not a cryptographic
// chain verify — the latter (~30 GB peak) is offered by the `zkqes
// verify-ceremony` CLI.

import { useState } from 'react';
import type { CeremonyStatusPayload } from '../../lib/ceremonyStatus';

interface PasteAttestationProps {
  readonly status: CeremonyStatusPayload;
}

interface VerifyResult {
  readonly ok: boolean;
  readonly message: string;
}

export function PasteAttestation({ status }: PasteAttestationProps) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  function handleVerify(): void {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
      setResult({ ok: false, message: '✗ empty input' });
      return;
    }
    const match = status.contributors.find(
      (c) => c.attestation?.toLowerCase() === trimmed,
    );
    if (!match) {
      setResult({ ok: false, message: '✗ not part of this ceremony' });
      return;
    }
    setResult({ ok: true, message: `✓ round ${match.round} · ${match.name}` });
  }

  return (
    <div
      className="ct-panel"
      style={{ padding: 'var(--ct-pad)', fontFamily: 'var(--mono)' }}
    >
      <h3 className="ct-tag">INSPECT &amp; VERIFY</h3>
      <textarea
        placeholder="paste attestation hash (sha-256 hex)"
        rows={3}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        style={{
          width: '100%',
          fontFamily: 'var(--mono)',
          marginTop: '8px',
        }}
      />
      <button
        type="button"
        className="ct-tab"
        onClick={handleVerify}
        style={{ marginTop: '8px' }}
      >
        verify
      </button>
      {result && (
        <p
          style={{
            marginTop: '8px',
            color: result.ok ? 'var(--ok)' : 'var(--err)',
          }}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
