import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { deploymentForChainId, zkqesCertificateAbi, zkqesRegistryV5_1Abi } from '@zkqes/sdk';
import { CertificatePreview } from '../../CertificatePreview';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const ZERO_NULLIFIER = `0x${'0'.repeat(64)}` as const;

/**
 * Reads the registered nullifier for the connected wallet from the V5
 * registry, then drives the IdentityEscrowNFT.mint() call.
 *
 * The IdentityEscrowNFT contract is preserved verbatim from V4
 * (contracts-eng's §7 compat work) — only the upstream registry source
 * differs. Mint flow: msg.sender → registry.nullifierOf(msg.sender) →
 * NFT.mint() picks up the same nullifier internally and atomically
 * binds the token to it.
 */
export function MintNftStep() {
  const { address } = useAccount();
  const chainId = useChainId();
  const dep = deploymentForChainId(chainId);

  const v5Deployed = dep && dep.registryV5 !== ZERO_ADDR;

  const { data: nullifier } = useReadContract({
    address: dep?.registryV5,
    abi: zkqesRegistryV5_1Abi,
    functionName: 'nullifierOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!v5Deployed },
  });

  const registered = !!nullifier && nullifier !== ZERO_NULLIFIER;

  const { data: tokenIdByNullifier } = useReadContract({
    address: dep?.zkqesCertificate,
    abi: zkqesCertificateAbi,
    functionName: 'tokenIdByNullifier',
    args: nullifier ? [nullifier as `0x${string}`] : undefined,
    query: { enabled: !!nullifier && !!dep },
  });

  const minted = !!tokenIdByNullifier && tokenIdByNullifier !== 0n;
  const previewTokenId = minted ? Number(tokenIdByNullifier) : 1;

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess: txMined } = useWaitForTransactionReceipt({ hash: txHash });

  const onMint = () => {
    if (!dep) return;
    writeContract({
      address: dep.zkqesCertificate,
      abi: zkqesCertificateAbi,
      functionName: 'mint',
    });
  };

  const chainLabel = chainId === 8453 ? 'Base' : 'Sepolia';
  const explorerBase = chainId === 8453 ? 'basescan.org' : 'sepolia.etherscan.io';

  // Civic-terminal v2 (task #84) — heading uses VT323 display, mint
  // CTA collapses to .ct-btn--lg.ct-btn--ua, OpenSea + tx links pick
  // up .ct-link.
  const headingStyle: React.CSSProperties = {
    fontFamily: 'var(--display)',
    fontSize: '52px',
    lineHeight: 1,
    margin: 0,
    color: 'var(--ct-ink)',
  };

  if (!v5Deployed) {
    return (
      <section
        aria-labelledby="mint-heading"
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <h1 id="mint-heading" style={headingStyle}>
          Mint your certificate
        </h1>
        <p
          data-testid="v5-mint-pending-deploy"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '14px',
            color: 'var(--ct-ink)',
          }}
        >
          Awaiting V5 registry deployment. Mint becomes available once
          orchestration §9.4 (Base Sepolia E2E) closes.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="mint-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <h1 id="mint-heading" style={headingStyle}>
        {minted ? 'Your certificate' : 'Mint your certificate'}
      </h1>
      <hr className="ct-divider" />
      <div className={txMined ? 'cert-stamp-in' : ''}>
        <CertificatePreview
          tokenId={previewTokenId}
          nullifier={(nullifier as `0x${string}`) ?? ZERO_NULLIFIER}
          chainLabel={chainLabel}
          mintTimestamp={Math.floor(Date.now() / 1000)}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!minted && !txMined && (
          <button
            type="button"
            onClick={onMint}
            disabled={isPending || !registered}
            data-testid="v5-mint-cta"
            className="ct-btn ct-btn--lg ct-btn--ua"
            style={{
              opacity: isPending || !registered ? 0.5 : 1,
              cursor: isPending || !registered ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            {isPending
              ? 'Minting…'
              : registered
                ? `Mint Certificate №${previewTokenId}`
                : 'Awaiting registration'}
          </button>
        )}
        {(minted || txMined) && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <a
              href={`https://${
                chainId === 8453
                  ? 'opensea.io/assets/base/'
                  : 'testnets.opensea.io/assets/sepolia/'
              }${dep?.zkqesCertificate}/${previewTokenId}`}
              target="_blank"
              rel="noreferrer"
              className="ct-link"
              style={{ fontFamily: 'var(--mono)', fontSize: '14px' }}
            >
              View on OpenSea
            </a>
          </div>
        )}
        {txHash && (
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              color: 'var(--ct-mute)',
              margin: 0,
            }}
          >
            tx:{' '}
            <a
              href={`https://${explorerBase}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="ct-link"
            >
              {txHash.slice(0, 12)}…
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
