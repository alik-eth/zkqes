// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// --ink + --rule + .doc-grid retired in favor of --ct-* tokens and
// inline-style flex layout (task #84). Footer renders the authority
// + network + locale identity strip — kept minimal, IBM Plex Mono.
//
// No wagmi dependency. The footer is informational; we deploy on
// Base Sepolia in V5.4 (#97) and the landing surface (zkqes.org)
// has no wallet context to read from. Hardcoding the chain matches
// where the registry actually lives. When mainnet ships, update
// `FOOTER_CHAIN_ID` and `chainLabel()` in lock-step.
import { deploymentForChainId } from '@zkqes/sdk';

const FOOTER_CHAIN_ID = 84532; // Base Sepolia

function chainLabel(chainId: number): string {
  if (chainId === 8453) return 'Base mainnet';
  if (chainId === 84532) return 'Base Sepolia';
  if (chainId === 11155111) return 'Sepolia';
  return 'unknown';
}

export function DocumentFooter() {
  const dep = deploymentForChainId(FOOTER_CHAIN_ID);
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
        <span>Network: {chainLabel(FOOTER_CHAIN_ID)}</span>
        <span>Locale: {document?.documentElement.lang ?? 'en'}</span>
      </div>
    </footer>
  );
}
