// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// PaperGrain + .doc-grid retired (task #84).
//
// Out-of-gate landing page. Reached when assessDeviceCapability() returns
// `denied` at the start of the V5 register flow (see Step1ConnectWallet).
//
// Spec amendment 9c866ad (review pass 5) made mobile-browser a hard
// acceptance gate: only flagship 2024+ phones with persist() granted are
// supported. Everyone else gets routed here BEFORE the zkey download
// starts, so we never burn quota on a device that can't finish the proof.
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DocumentFooter } from '../../components/DocumentFooter';
import '../../styles/civic-terminal.css';

const DESKTOP_URL = 'https://app.zkqes.org/ua/registerV5';

export function UseDesktopScreen() {
  const { t } = useTranslation();
  // Inline QR data-URL is heavy; we link out to a static QR endpoint
  // instead. Most modern phone cameras lift URLs from text — the QR is
  // a courtesy, not the primary handoff.
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    DESKTOP_URL,
  )}`;

  return (
    <main
      className="ct"
      data-testid="use-desktop-page"
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
          padding: '96px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '40px',
        }}
      >
        <Link to="/" className="ct-link" style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
          ← back
        </Link>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: '48px',
              lineHeight: 1,
              margin: 0,
              color: 'var(--ct-ink)',
            }}
          >
            {t(
              'deviceGate.useDesktop.heading',
              "This device can't host the zero-knowledge prover.",
            )}
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
              'deviceGate.useDesktop.body',
              'The prover needs about 2.5 GB of cached storage on your device — most phone browsers cap web pages well below that, so the proof would fail mid-flight. Open this page on a desktop or laptop browser instead and pick up where you left off.',
            )}
          </p>
        </header>
        <hr className="ct-divider" />
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '14px',
              wordBreak: 'break-all',
              color: 'var(--ct-ink)',
            }}
          >
            {DESKTOP_URL}
          </p>
          <img
            src={qrSrc}
            alt={t('deviceGate.useDesktop.qrCaption', 'QR code to app.zkqes.org on desktop')}
            width={200}
            height={200}
            style={{ border: '1px solid var(--ct-rule)' }}
            data-testid="use-desktop-qr"
          />
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              color: 'var(--ct-mute)',
            }}
          >
            {t(
              'deviceGate.useDesktop.qrCaption',
              'Scan with another phone, or type the URL into a desktop browser.',
            )}
          </p>
        </section>
      </div>
      <DocumentFooter />
    </main>
  );
}
