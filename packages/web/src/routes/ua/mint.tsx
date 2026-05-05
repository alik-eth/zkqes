import { Link } from '@tanstack/react-router';
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTranslation } from 'react-i18next';
import { deploymentForChainId, zkqesRegistryV4Abi, zkqesCertificateAbi } from '@zkqes/sdk';
import { CertificatePreview } from '../../components/CertificatePreview';
import { StepIndicator } from '../../components/StepIndicator';
import { DocumentFooter } from '../../components/DocumentFooter';

export function MintScreen() {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const dep = deploymentForChainId(chainId);

  const { data: nullifier } = useReadContract({
    address: dep?.registry,
    abi: zkqesRegistryV4Abi,
    functionName: 'nullifierOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!dep },
  });

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

  // Civic-terminal v2 (task #84) — .doc-grid + sovereign-on-bone
  // CTA retired in favor of .ct page chrome + .ct-btn--ua.
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
        <StepIndicator current={3} />
        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: '48px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--ct-ink)',
          }}
        >
          {minted
            ? t('mint.titleHolder', 'Your certificate')
            : t('mint.title', 'Mint your certificate')}
        </h1>
        <hr className="ct-divider" />
        {dep && (
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ct-mute)',
              margin: 0,
            }}
          >
            Issued by authority · {dep.registry.slice(0, 6)}…
            {dep.registry.slice(-4)} · {chainLabel}
          </p>
        )}
        <div className={txMined ? 'cert-stamp-in' : ''}>
          <CertificatePreview
            tokenId={previewTokenId}
            nullifier={
              (nullifier as `0x${string}`) ?? (`0x${'0'.repeat(64)}` as `0x${string}`)
            }
            chainLabel={chainLabel}
            mintTimestamp={Math.floor(Date.now() / 1000)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!minted && !txMined && !isConnected && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
              <p style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--ct-mute)' }}>
                {t('mint.connectPrompt', 'Connect a wallet to mint your certificate.')}
              </p>
              <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />
            </div>
          )}
          {!minted && !txMined && isConnected && (
            <button
              onClick={onMint}
              disabled={isPending || !nullifier}
              className="ct-btn ct-btn--lg ct-btn--ua"
              style={{
                opacity: isPending || !nullifier ? 0.5 : 1,
                cursor: isPending || !nullifier ? 'not-allowed' : 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              {isPending
                ? t('mint.pending', 'Minting…')
                : t('mint.cta', `Mint Certificate №${previewTokenId}`)}
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
                {t('mint.opensea', 'View on OpenSea')}
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=I'm a verified Ukrainian. Certificate %E2%84%96${previewTokenId} on zkqes.org`}
                target="_blank"
                rel="noreferrer"
                className="ct-link"
                style={{ fontFamily: 'var(--mono)', fontSize: '14px' }}
              >
                {t('mint.share', 'Share')}
              </a>
            </div>
          )}
          {txHash && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ct-mute)' }}>
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
      </div>
      <style>{`
        .cert-stamp-in {
          animation: stampIn 0.8s cubic-bezier(.2,.7,.2,1) both;
          transform-origin: center;
        }
        @keyframes stampIn {
          0%   { transform: scale(1.4) rotate(-1.2deg); opacity: 0; filter: blur(6px); }
          60%  { transform: scale(1.05) rotate(0.4deg); opacity: 1; filter: blur(0); }
          100% { transform: scale(1)    rotate(0deg);   opacity: 1; }
        }
      `}</style>
      <DocumentFooter />
    </main>
  );
}
