import { useAccount, useChainId, useReadContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link, useNavigate } from '@tanstack/react-router';
import { resolveLandingState, resolveSecondaryCtas } from '../lib/landingState';
import {
  deploymentForChainId,
  zkqesCertificateAbi,
  zkqesRegistryV4Abi,
  zkqesRegistryV5_1Abi,
} from '@zkqes/sdk';
import { ACTIVE_CHAIN } from '../lib/wagmi';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const ZERO_NULLIFIER = `0x${'00'.repeat(32)}` as const;

export function MintButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const dep = deploymentForChainId(chainId);
  const navigate = useNavigate();

  // Prefer V5 registry as the source-of-truth for "registered" status when
  // it's deployed; fall back to V4 until §9.4 closes. This keeps the
  // landing CTA accurate in both pre-deploy (V4-only) and post-deploy
  // (V5 takes over) states without flag-switching.
  const v5Deployed = !!dep && dep.registryV5 !== ZERO_ADDR;

  const { data: nullifierV5 } = useReadContract({
    address: dep?.registryV5,
    abi: zkqesRegistryV5_1Abi,
    functionName: 'nullifierOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && v5Deployed },
  });

  const { data: nullifierV4 } = useReadContract({
    address: dep?.registry,
    abi: zkqesRegistryV4Abi,
    functionName: 'nullifierOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!dep && !v5Deployed },
  });

  const nullifier = (nullifierV5 ?? nullifierV4) as `0x${string}` | undefined;
  const registered = !!nullifier && nullifier !== ZERO_NULLIFIER;

  const { data: tokenIdByNullifier } = useReadContract({
    address: dep?.zkqesCertificate,
    abi: zkqesCertificateAbi,
    functionName: 'tokenIdByNullifier',
    args: registered && nullifier ? [nullifier] : undefined,
    query: { enabled: registered && !!dep },
  });

  const mintedTokenId = Number(tokenIdByNullifier ?? 0n);
  const minted = mintedTokenId > 0;

  const landingInputs = {
    walletConnected: isConnected,
    chainOk: chainId === ACTIVE_CHAIN.id,
    registered,
    minted,
    nowSeconds: Math.floor(Date.now() / 1000),
    mintDeadline: dep?.mintDeadline ?? 0,
    nextTokenId: 1,
    mintedTokenId,
  };
  const state = resolveLandingState(landingInputs);
  const secondary = resolveSecondaryCtas(landingInputs);

  if (state.action === 'connect') {
    return <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />;
  }

  const handleClick = () => {
    if (state.action === 'switchChain') {
      window.alert(`Please switch to ${ACTIVE_CHAIN.name}`);
      return;
    }
    if (state.action === 'routeToRegisterV5') navigate({ to: '/ua/registerV5' });
    if (state.action === 'routeToCli')        navigate({ to: '/ua/cli' });
    if (state.action === 'routeToMint')       navigate({ to: '/ua/mint' });
    if (state.action === 'routeToMintNft')    navigate({ to: '/ua/mintNft' });
    if (state.action === 'viewCertificate')   navigate({ to: '/ua/mintNft' });
  };

  // Civic-terminal v2 (task #84) — primary CTA uses .ct-btn--ua
  // (UA-yellow on UA-blue) for the call-to-action emphasis;
  // secondary navigation uses .ct-link (UA-blue underline).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state.disabled}
        className="ct-btn ct-btn--lg ct-btn--ua"
        style={{
          opacity: state.disabled ? 0.5 : 1,
          cursor: state.disabled ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {state.label}
      </button>
      {(secondary.showCliLink || secondary.showViewCertificate) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            fontFamily: 'var(--mono)',
            fontSize: '13px',
          }}
        >
          {secondary.showCliLink && (
            <Link to="/ua/cli" className="ct-link">
              Use the CLI instead →
            </Link>
          )}
          {secondary.showViewCertificate && (
            <Link to="/ua/mintNft" className="ct-link">
              View your certificate →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
