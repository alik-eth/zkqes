import { Link, useNavigate } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { deploymentForChainId, zkqesRegistryV4Abi } from '@zkqes/sdk';
import { validateProof, type ProofPayload } from '../../lib/proofValidator';
import { StepIndicator } from '../../components/StepIndicator';
import { DocumentFooter } from '../../components/DocumentFooter';

export function SubmitScreen() {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const dep = deploymentForChainId(chainId);
  const navigate = useNavigate();

  const [payload, setPayload] = useState<ProofPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const {
    isSuccess: txMined,
    isError: txFailed,
    error: txError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setPayload(null);
    const text = await file.text();
    const result = validateProof(text);
    if (!result.ok) {
      setError(result.reason);
    } else {
      setPayload(result.payload);
    }
  }, []);

  const onSubmit = useCallback(() => {
    if (!payload || !dep || !address) return;
    const cp = payload.chainProof;
    const lp = payload.leafProof;
    writeContract({
      address: dep.registry,
      abi: zkqesRegistryV4Abi,
      functionName: 'register',
      args: [
        {
          proof: {
            a: cp.proof.a.map(BigInt) as [bigint, bigint],
            b: cp.proof.b.map((row) => row.map(BigInt)) as [
              [bigint, bigint],
              [bigint, bigint],
            ],
            c: cp.proof.c.map(BigInt) as [bigint, bigint],
          },
          rTL: BigInt(cp.rTL),
          algorithmTag: BigInt(cp.algorithmTag),
          leafSpkiCommit: BigInt(cp.leafSpkiCommit),
        },
        {
          proof: {
            a: lp.proof.a.map(BigInt) as [bigint, bigint],
            b: lp.proof.b.map((row) => row.map(BigInt)) as [
              [bigint, bigint],
              [bigint, bigint],
            ],
            c: lp.proof.c.map(BigInt) as [bigint, bigint],
          },
          pkX: lp.pkX.map(BigInt) as [bigint, bigint, bigint, bigint],
          pkY: lp.pkY.map(BigInt) as [bigint, bigint, bigint, bigint],
          ctxHash: BigInt(lp.ctxHash),
          policyLeafHash: BigInt(lp.policyLeafHash),
          policyRoot_: BigInt(lp.policyRoot),
          timestamp: BigInt(lp.timestamp),
          nullifier: BigInt(lp.nullifier),
          leafSpkiCommit: BigInt(lp.leafSpkiCommit),
          dobCommit: BigInt(lp.dobCommit),
          dobSupported: BigInt(lp.dobSupported),
        },
      ],
    });
  }, [payload, dep, address, writeContract]);

  if (txMined) {
    setTimeout(() => navigate({ to: '/ua/mint' }), 1500);
  }

  // Civic-terminal v2 (task #84) — .doc-grid + sovereign-on-bone
  // CTA retired. Drop zone uses dashed --ct-rule border (civic-
  // terminal field-outline grammar); submit CTA collapses to .ct-btn.
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
        <Link to="/ua/cli" className="ct-link" style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
          ← back
        </Link>
        <StepIndicator current={2} />
        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: '48px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--ct-ink)',
          }}
        >
          {t('submit.title', 'Submit your proof')}
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
          {t(
            'submit.lede',
            'Drop the proof.json the CLI generated. We submit it to the registry on-chain.',
          )}
        </p>
        <hr className="ct-divider" />
        <label
          style={{
            display: 'block',
            padding: '48px',
            textAlign: 'center',
            cursor: 'pointer',
            border: '1.5px dashed var(--ct-rule)',
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) await onFile(f);
          }}
        >
          <input
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await onFile(f);
            }}
          />
          <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', color: 'var(--ct-ink)' }}>
            {payload
              ? t('submit.ready', 'proof.json loaded — ready to submit')
              : t('submit.drop', 'Drag proof.json here, or click to browse')}
          </span>
        </label>
        {error && (
          <p style={{ color: 'var(--err)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
            {error}
          </p>
        )}
        <button
          onClick={onSubmit}
          disabled={!payload || !isConnected || isPending}
          className="ct-btn ct-btn--lg"
          style={{
            opacity: !payload || !isConnected || isPending ? 0.5 : 1,
            cursor: !payload || !isConnected || isPending ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {isPending
            ? t('submit.pending', 'Submitting…')
            : t('submit.cta', 'Submit registration')}
        </button>
        {txHash && (
          <p style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ct-mute)' }}>
            tx:{' '}
            <a
              href={`https://${chainId === 8453 ? 'basescan.org' : 'sepolia.etherscan.io'}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="ct-link"
            >
              {txHash.slice(0, 12)}…
            </a>
          </p>
        )}
        {txFailed && (
          <p style={{ color: 'var(--err)', fontFamily: 'var(--mono)', fontSize: '13px' }}>
            {txError?.message ?? 'tx failed'}
          </p>
        )}
      </div>
      <DocumentFooter />
    </main>
  );
}
