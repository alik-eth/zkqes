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

// PKCS#7 SignedData OID (1.2.840.113549.1.7.2) DER-encoded as
// `06 09 2A 86 48 86 F7 0D 01 07 02`. A real .p7s carries this OID
// inside the outer ContentInfo wrapper, typically within the first
// ~30 bytes for DER-encoded CAdES.
const SIGNED_DATA_OID_HEX = '06092a864886f70d010702';

const ACCEPT_EXT = ['.p7s', '.p7m', '.cms', '.p7'];

interface ValidationResult {
  ok: boolean;
  error?: string;
  size?: number;
}

function bytesToHex(bytes: Uint8Array, max: number): string {
  const slice = bytes.subarray(0, max);
  let s = '';
  for (let i = 0; i < slice.length; i++) {
    s += slice[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

function validateP7s(filename: string, bytes: Uint8Array): ValidationResult {
  const lower = filename.toLowerCase();
  if (!ACCEPT_EXT.some((ext) => lower.endsWith(ext))) {
    return { ok: false, error: `Wrong file type. Need ${ACCEPT_EXT.join(' / ')}; got ${lower.split('.').pop() ?? '<no ext>'}.` };
  }
  if (bytes.length < 64) {
    return { ok: false, error: `File too small (${bytes.length} bytes). A real CAdES .p7s is at least a few KB.` };
  }
  if (bytes[0] !== 0x30) {
    return { ok: false, error: `Not a DER-encoded ASN.1 structure (first byte 0x${bytes[0]?.toString(16).padStart(2, '0')}, expected 0x30).` };
  }
  // Scan first 256 bytes for the PKCS#7 SignedData OID. Real CAdES
  // emits it within the first ~30 bytes; allow generous slack for
  // pathological wrappers.
  const head = bytesToHex(bytes, 256);
  if (!head.includes(SIGNED_DATA_OID_HEX)) {
    return { ok: false, error: 'No PKCS#7 SignedData OID found. This may be a different ASN.1 structure (cert? CRL? plain CMS?), not a CAdES signature.' };
  }
  return { ok: true, size: bytes.length };
}

export function Step3DiiaSign({ onP7s, onBack }: Step3Props) {
  const { t } = useTranslation();
  const [filename, setFilename] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const v = validateP7s(file.name, bytes);
    setFilename(file.name);
    if (!v.ok) {
      setValidationError(v.error ?? 'Unknown validation error.');
      setSize(null);
      // Do NOT call onP7s — keep the parent state clean so step 4
      // doesn't pick up garbage.
      return;
    }
    setValidationError(null);
    setSize(v.size ?? bytes.length);
    onP7s(bytes);
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
                color: validationError ? 'var(--err)' : 'var(--ct-mute)',
              }}
            >
              {validationError ? '✕ Rejected' : `✓ Loaded · ${size ? `${size.toLocaleString()} bytes` : ''}`}
            </p>
            <p
              data-testid="v5-p7s-filename"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '14px',
                wordBreak: 'break-all',
                color: validationError ? 'var(--err)' : 'var(--ct-ink)',
              }}
            >
              {filename}
            </p>
            <p
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '12px',
                color: validationError ? 'var(--err)' : 'var(--ct-mute)',
                lineHeight: 1.5,
              }}
            >
              {validationError
                ?? t('registerV5.step3.replaceHint', 'Click to replace, or continue to Step 03 below.')}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '14px',
                color: 'var(--ct-ink)',
              }}
            >
              Drop your .p7s here, or click to browse
            </span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: '11px',
              color: 'var(--ct-mute)', letterSpacing: '.06em',
            }}>
              accepts: {ACCEPT_EXT.join(' · ')} — validated on drop
            </span>
          </div>
        )}
      </label>

      <hr className="ct-divider" />

      <div>
        <button
          type="button"
          onClick={onBack}
          className="cv-btn is-ghost"
        >
          {t('registerV5.step3.back')}
        </button>
      </div>
    </section>
  );
}
