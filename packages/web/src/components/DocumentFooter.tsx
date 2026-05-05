// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// --ink + --rule + .doc-grid retired in favor of --ct-* tokens and
// inline-style flex layout (task #84). Footer renders the authority
// + network + locale identity strip — kept minimal, IBM Plex Mono.
import { useChainId } from 'wagmi';
import { deploymentForChainId } from '@zkqes/sdk';

export function DocumentFooter() {
  const chainId = useChainId();
  const dep = deploymentForChainId(chainId);
  const network =
    chainId === 8453
      ? 'Base mainnet'
      : chainId === 11155111
        ? 'Sepolia'
        : 'unknown';
  return (
    <footer
      style={{
        borderTop: '1px solid var(--ct-rule-soft)',
        marginTop: '96px',
        padding: '24px 0',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '32px',
          fontFamily: 'var(--mono)',
          fontSize: '12px',
          color: 'var(--ct-mute)',
        }}
      >
        <span>Authority: {dep?.registry ?? '0x… (unset)'}</span>
        <span>Network: {network}</span>
        <span>Locale: {document?.documentElement.lang ?? 'en'}</span>
      </div>
    </footer>
  );
}
