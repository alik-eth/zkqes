// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// sovereign/bone tokens retired here per founder direction 2026-05-05
// (task #84). Drop zone uses dashed --ct-rule border (the civic-
// terminal "field" outline grammar) instead of the prior --ink dashed
// line; ready-state filename surfaces in --ct-ink mono. testids +
// behaviour byte-identical.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface Step3Props {
  onP7s: (bytes: Uint8Array) => void;
  onBack: () => void;
}

export function Step3DiiaSign({ onP7s, onBack }: Step3Props) {
  const { t } = useTranslation();
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File): Promise<void> => {
    const buf = await file.arrayBuffer();
    setFilename(file.name);
    onP7s(new Uint8Array(buf));
  };

  return (
    <section
      aria-labelledby="step3-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <h2
        id="step3-heading"
        style={{
          fontFamily: 'var(--display)',
          fontSize: '36px',
          lineHeight: 1,
          margin: 0,
          color: 'var(--ct-ink)',
        }}
      >
        {t('registerV5.step3.title')}
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
        {t('registerV5.step3.body')}
      </p>

      <label
        style={{
          display: 'block',
          padding: '48px',
          textAlign: 'center',
          cursor: 'pointer',
          border: '1.5px dashed var(--ct-rule)',
          background: dragOver ? 'var(--ct-paper-2)' : 'transparent',
          color: 'var(--ct-ink)',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) await handleFile(f);
        }}
      >
        <input
          type="file"
          accept=".p7s,application/pkcs7-signature"
          aria-label={t('registerV5.step3.aria', 'Diia .p7s upload')}
          data-testid="v5-p7s-upload"
          // Inline style is more robust than the Tailwind `hidden`
          // utility against HMR/order-of-load edge cases that have
          // surfaced on dev builds where the native file-chooser UI
          // briefly leaks before CSS hydrates.
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await handleFile(f);
          }}
        />
        {filename ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ct-mute)',
              }}
            >
              {t('registerV5.step3.readyLabel', 'Loaded')}
            </p>
            <p
              data-testid="v5-p7s-filename"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '14px',
                wordBreak: 'break-all',
                color: 'var(--ct-ink)',
              }}
            >
              {filename}
            </p>
            <p
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '12px',
                color: 'var(--ct-mute)',
              }}
            >
              {t(
                'registerV5.step3.replaceHint',
                'Click to replace, or continue to Step 4 below.',
              )}
            </p>
          </div>
        ) : (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '14px',
              color: 'var(--ct-ink)',
            }}
          >
            {t(
              'registerV5.step3.drop',
              'Drag your .p7s here, or click to browse',
            )}
          </span>
        )}
      </label>

      <hr className="ct-divider" />

      <div>
        <button
          type="button"
          onClick={onBack}
          className="ct-btn"
        >
          {t('registerV5.step3.back')}
        </button>
      </div>
    </section>
  );
}
