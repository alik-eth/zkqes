// CeremonyFaq — /ceremony right-column collapsible FAQ.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 6.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §4.4.

const FAQ_ITEMS: Array<{ readonly q: string; readonly a: string }> = [
  {
    q: "what's a trusted setup",
    a: 'A multi-party ceremony that produces the Groth16 proving key. As long as one contributor honestly destroys their entropy, the resulting key is sound.',
  },
  {
    q: 'why 32 GB RAM',
    a: 'snarkjs zkey contribute peaks at ~30 GB during the contribution. Cloud paths offload this to a remote VM.',
  },
  {
    q: 'what does verify do here',
    a: 'It looks up the pasted SHA-256 in the published attestation list and confirms which round/contributor it corresponds to. Cryptographic chain verify (~30 GB peak) is offered separately as the zkqes verify-ceremony CLI.',
  },
  {
    q: 'how do I know my entropy was independent',
    a: "It's destroyed in your own machine, never leaving it. Cookbook commands show exactly what runs locally.",
  },
];

export function CeremonyFaq() {
  return (
    <details
      className="ct-panel"
      style={{
        padding: 'var(--ct-pad)',
        fontFamily: 'var(--mono)',
        fontSize: '12px',
      }}
    >
      <summary style={{ cursor: 'pointer' }}>FAQ</summary>
      <dl>
        {FAQ_ITEMS.map(({ q, a }) => (
          <div key={q} style={{ marginTop: '8px' }}>
            <dt>
              <strong>{q}</strong>
            </dt>
            <dd style={{ marginLeft: 0 }}>{a}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
