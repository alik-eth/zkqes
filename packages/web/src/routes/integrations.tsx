// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// .doc-grid + --ink/--bone code-block tokens retired (task #84).
// Code blocks now render against --hilite/--hilite-text (Curve-era
// selection blue) for terminal-style emphasis.
import { Link } from '@tanstack/react-router';
import { ZKQES_DEPLOYMENTS } from '@zkqes/sdk';
import { DocumentFooter } from '../components/DocumentFooter';
import '../styles/civic-terminal.css';

const PRE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '13px',
  padding: '16px',
  overflowX: 'auto',
  background: 'var(--hilite)',
  color: 'var(--hilite-text)',
  margin: 0,
};

const H2_STYLE: React.CSSProperties = {
  fontFamily: 'var(--display)',
  fontSize: '28px',
  lineHeight: 1,
  margin: 0,
  color: 'var(--ct-ink)',
};

export function IntegrationsScreen() {
  return (
    <main
      className="ct"
      style={{
        minHeight: '100vh',
        background: 'var(--ct-paper)',
        color: 'var(--ct-ink)',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '48px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <Link to="/" className="ct-link" style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
          ← back
        </Link>
        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: '48px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--ct-ink)',
          }}
        >
          Integrate zkqes verification
        </h1>
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '15px',
            lineHeight: 1.5,
            maxWidth: '60ch',
            color: 'var(--ct-ink)',
          }}
        >
          Gate your contract or webapp on zkqes-verified Ukrainian status.
        </p>
        <hr className="ct-divider" />

        <h2 style={H2_STYLE}>Solidity</h2>
        <pre style={PRE_STYLE}>
{`forge install alik-eth/zkqes

// in your contract:
import { Verified, IZkqesRegistry } from "@zkqes/contracts-sdk/Verified.sol";

contract MyDApp is Verified {
    constructor(IZkqesRegistry r) Verified(r) {}
    function privileged() external onlyVerifiedUkrainian { /* ... */ }
}`}
        </pre>

        <h2 style={H2_STYLE}>TypeScript (viem)</h2>
        <pre style={PRE_STYLE}>
{`import { isVerified, ZKQES_DEPLOYMENTS } from '@zkqes/sdk';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http() });
const ok = await isVerified(client, ZKQES_DEPLOYMENTS.base.registry, addr);`}
        </pre>

        <h2 style={H2_STYLE}>Deployed registries</h2>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '13px',
              borderCollapse: 'collapse',
              color: 'var(--ct-ink)',
            }}
          >
            <thead>
              <tr>
                <th style={{ paddingRight: '24px', textAlign: 'left' }}>Network</th>
                <th style={{ textAlign: 'left' }}>Address</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ZKQES_DEPLOYMENTS).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ paddingRight: '24px', padding: '4px 24px 4px 0' }}>{k}</td>
                  <td style={{ padding: '4px 0', wordBreak: 'break-all' }}>{v.registry}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DocumentFooter />
    </main>
  );
}
