// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// sovereign-indigo / bone tokens retired here per founder direction
// 2026-05-05 (task #84) — surface now uses only `--ct-*` tokens +
// `.ct-*` primitives. VT323 display + IBM Plex Mono body; no shadows,
// no rounded corners, no Tailwind responsive classes. Behaviour
// (RainbowKit ConnectButton + sr-only address mirror + onAdvance
// callback) is byte-identical; only styling changes.
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useTranslation } from 'react-i18next';

export interface Step1Props {
  onAdvance: () => void;
}

export function Step1ConnectWallet({ onAdvance }: Step1Props) {
  const { t } = useTranslation();
  const { isConnected, address } = useAccount();
  return (
    <section
      aria-labelledby="step1-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <h2
        id="step1-heading"
        style={{
          fontFamily: 'var(--display)',
          fontSize: '36px',
          lineHeight: 1,
          margin: 0,
          color: 'var(--ct-ink)',
        }}
      >
        {t('registerV5.step1.title')}
      </h2>
      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '14px',
          lineHeight: 1.5,
          maxWidth: '60ch',
          color: 'var(--ct-ink)',
        }}
      >
        {t('registerV5.step1.body')}
      </p>
      <ConnectButton />
      {isConnected && address && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/*
            RainbowKit's ConnectButton renders the truncated address pill
            already; we only mirror the full address as sr-only so the
            v5-connected-address testid (e2e + a11y reads) still fires
            without duplicating the visual treatment.
          */}
          <span data-testid="v5-connected-address" className="sr-only">
            {address}
          </span>
          <button
            type="button"
            onClick={onAdvance}
            className="ct-btn"
          >
            {t('registerV5.step1.advance')}
          </button>
        </div>
      )}
    </section>
  );
}
