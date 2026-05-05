// TestnetBanner — top-of-page strip flagging that the build is
// targeting a testnet chain. Renders whenever `VITE_CHAIN` resolves
// to anything other than `mainnet` (so `sepolia`, `goerli`, etc. all
// trip it). Hidden on mainnet builds — the absence-by-default policy
// keeps the production surface clean while making the testnet posture
// loud-and-impossible-to-miss everywhere else.
//
// Sister banner: PreviewModeBanner — driven by the *ceremony phase*,
// not the chain. Both can fire simultaneously (e.g. testnet build of
// a pre-ceremony surface) and stack vertically; that's intentional —
// they're orthogonal warnings.
//
// Bypass via VITE_HIDE_TESTNET_BANNER=1 for marketing screenshots /
// deck shots that don't want the banner in frame. Production deploys
// do NOT set that flag.

const CHAIN: string = (import.meta.env.VITE_CHAIN as string | undefined) ?? '';
const HIDE: boolean = import.meta.env.VITE_HIDE_TESTNET_BANNER === '1';

const CHAIN_LABEL: Record<string, string> = {
  sepolia: 'Sepolia',
  goerli: 'Goerli',
  'base-sepolia': 'Base Sepolia',
};

export function TestnetBanner() {
  if (HIDE) return null;
  if (CHAIN === '' || CHAIN === 'mainnet' || CHAIN === 'base') return null;
  const label = CHAIN_LABEL[CHAIN] ?? CHAIN;
  return (
    <div
      role="status"
      aria-label={`Testnet: ${label}`}
      data-testid="testnet-banner"
      style={{
        padding: '8px var(--ct-pad)',
        background: 'var(--warn)',
        color: '#0e0e0e',
        fontFamily: 'var(--mono)',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        textAlign: 'center',
        borderBottom: '1.5px solid var(--ct-ink)',
      }}
    >
      ▲ Testnet — {label} · no real funds, no production trust
    </div>
  );
}
