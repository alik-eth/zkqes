// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// sovereign/bone tokens retired here per founder direction 2026-05-05
// (task #84). Behaviour unchanged — only styling migrates to `--ct-*`
// tokens + `.ct-btn` / `.ct-divider` primitives + VT323 / IBM Plex Mono.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from 'wagmi';
import { buildUaBindingV2 } from '../../../lib/uaBindingGenerator';
import {
  recoverPubkeyFromWallet,
  WalletPubkeyError,
} from '../../../lib/walletPubkey';
import { pkAddressFromHex } from '../../../lib/pkAddress';

export interface Step2Props {
  onAdvance: (bindingBytes: Uint8Array) => void;
  onBack: () => void;
  /** Hide the internal back button. Used by the inline app wizard at
   *  the entry step where "back" doesn't apply — the parent renders a
   *  separate "Disconnect wallet" affordance instead. */
  hideBack?: boolean;
}

type BuildState =
  | { kind: 'idle' }
  | { kind: 'recovering' }
  | { kind: 'ready'; bindingBytes: Uint8Array; bcanonText: string }
  | { kind: 'error'; message: string };

/**
 * Trigger a browser download of the JCS-canonical bcanon bytes so the
 * user can attach them to Diia (the only currently-supported QTSP) and
 * produce a CAdES-BES signature over them. The bytes are valid UTF-8
 * JSON (RFC 8785, JSON Canonicalization Scheme) — deterministic key
 * order, no whitespace — which is exactly what Diia's signer hashes
 * inside the messageDigest attribute and what the V5 circuit's
 * signed-attrs OID stream consumes verbatim.
 *
 * Filename `binding.qkb2.json` and `application/json` MIME match the
 * fixture convention in `packages/sdk/fixtures/v5/admin-ecdsa/`. A
 * curious user can open the file in any text editor and visually
 * inspect the binding's core fields before signing.
 */
function downloadBindingFile(bytes: Uint8Array): void {
  // Copy into a fresh ArrayBuffer so the Blob owns its own memory; the
  // SharedArrayBuffer-vs-ArrayBuffer typing in some bundler outputs
  // breaks if we hand the Uint8Array directly.
  const owned = new Uint8Array(bytes.length);
  owned.set(bytes);
  const blob = new Blob([owned], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'binding.qkb2.json';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click finishes before the blob URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const HEADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--display)',
  fontSize: '36px',
  lineHeight: 1,
  margin: 0,
  color: 'var(--ct-ink)',
};

const BODY_STYLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: '14px',
  lineHeight: 1.5,
  maxWidth: '60ch',
  color: 'var(--ct-ink)',
};

/**
 * Step 2 — produce the QKB/2.0 binding bytes.
 *
 * Flow:
 *   1. Recover the wallet's secp256k1 public key via personal_sign +
 *      recoverPublicKey (one-time signature; the signature itself is
 *      discarded — only the recovered pubkey lands in the binding).
 *   2. Generate a 32-byte random nonce (binding-replay protection).
 *   3. Build the QKB/2.0 binding (core + display) and JCS-canonicalize
 *      to ≤ 1024 byte `bcanon` (= what Diia will sign + the V5 circuit
 *      consumes).
 *   4. Surface bcanon to the user (hex preview), pass it through
 *      onAdvance to Step 3 → Step 4.
 *
 * Detailed binding builder lives in `packages/web/src/lib/bindingV2.ts`
 * (V4-era; V5 reuses since the binding shape is locked by orchestration
 * §0). Display + extensions are OUTSIDE the proving surface — only the
 * core fields are JCS-canonicalized.
 */
export function Step2GenerateBinding({ onAdvance, onBack, hideBack }: Step2Props) {
  const { t } = useTranslation();
  const { address: connectedAddress } = useAccount();
  const [state, setState] = useState<BuildState>({ kind: 'idle' });
  const [downloaded, setDownloaded] = useState(false);
  // Guards against React 18 strict-mode double-invoke firing two
  // wallet-sign requests on mount.
  const generateStartedRef = useRef(false);
  // Guards against the download firing twice when state transitions
  // through 'ready' multiple times (e.g. retry).
  const downloadFiredRef = useRef(false);

  // Mock-prover mode (Playwright e2e + dev preview): the wallet mock
  // doesn't sign anything, so we synthesize a deterministic pk/nonce
  // and skip the wallet roundtrip. Mock-prover ignores bindingBytes
  // anyway; we just need a syntactically-valid binding to thread
  // through the state machine.
  const useMockProver =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_USE_MOCK_PROVER === '1';

  const onGenerate = async (): Promise<void> => {
    setState({ kind: 'recovering' });
    try {
      const pk = new Uint8Array(65);
      if (useMockProver) {
        // Mock-prover synthetic pubkey: secp256k1 generator G (private
        // key 1). buildUaBindingV2 validates the pk is on-curve via
        // `@noble/secp256k1.ProjectivePoint.fromHex().assertValidity()`,
        // so we use a known-valid point rather than an arbitrary byte
        // pattern. Reference: SEC 2 §2.4.1, secp256k1 G.
        const G_HEX =
          '04' +
          '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
          '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
        for (let i = 0; i < 65; i++) {
          pk[i] = Number.parseInt(G_HEX.slice(i * 2, i * 2 + 2), 16);
        }
      } else {
        const { pubkeyHex } = await recoverPubkeyFromWallet();
        // Convert hex → Uint8Array. pubkeyHex is `04` + 64 X + 64 Y.
        for (let i = 0; i < 65; i++) {
          pk[i] = Number.parseInt(pubkeyHex.slice(i * 2, i * 2 + 2), 16);
        }
      }
      const nonce = new Uint8Array(32);
      if (useMockProver) {
        nonce.fill(0xab);
      } else {
        crypto.getRandomValues(nonce);
      }
      const timestamp = useMockProver
        ? 1777478400
        : Math.floor(Date.now() / 1000);
      const { bcanon } = buildUaBindingV2({ pk, timestamp, nonce });
      // 32-char hex preview for the UI; full bytes flow through onAdvance.
      const headHex = Array.from(bcanon.subarray(0, 16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const tailHex = Array.from(bcanon.subarray(bcanon.length - 16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const bcanonText = `${bcanon.byteLength} bytes — ${headHex}…${tailHex}`;
      setState({ kind: 'ready', bindingBytes: bcanon, bcanonText });
    } catch (err) {
      const message =
        err instanceof WalletPubkeyError
          ? `${err.message} (${err.code})`
          : err instanceof Error
            ? err.message
            : String(err);
      setState({ kind: 'error', message });
    }
  };

  const onContinue = (): void => {
    if (state.kind !== 'ready' || !downloaded) return;
    onAdvance(state.bindingBytes);
  };

  /**
   * Upload an existing `binding.qkb2.json` instead of generating a fresh
   * one. Skips the wallet-sign that pubkey-recovery requires (the binding
   * already encodes `pkBytes`), but still validates that the encoded
   * pubkey resolves to the currently-connected wallet — otherwise the
   * .p7s the user is about to upload is bound to a different wallet
   * than the one Step 4's register() call would route through.
   *
   * Accepts the file as-is (raw bytes from disk). DO NOT re-canonicalize
   * — the .p7s's signedAttrs.messageDigest hashes the file's exact byte
   * sequence; any reformatting would break the line 421 constraint
   * (`bindingDigestBytes === messageDigestBytes`) inside the V5 circuit.
   */
  const onUpload = (file: File): void => {
    setState({ kind: 'recovering' });
    void (async () => {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('binding file is not a JSON object');
        }
        const obj = parsed as Record<string, unknown>;
        const pkField = obj.pk;
        if (typeof pkField !== 'string' || !/^(?:0x)?04[0-9a-fA-F]{128}$/i.test(pkField)) {
          throw new Error(
            'binding file missing or malformed `pk` field (expected uncompressed secp256k1 hex, 130 chars starting with 04 or 0x04)',
          );
        }
        if (connectedAddress === undefined) {
          throw new Error('connect a wallet before uploading a binding');
        }
        const bindingAddr = pkAddressFromHex(pkField).toLowerCase();
        if (bindingAddr !== connectedAddress.toLowerCase()) {
          throw new Error(
            `this binding was issued for ${bindingAddr.slice(0, 6)}…${bindingAddr.slice(-4)}, but the connected wallet is ${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}. Connect the matching wallet or generate a fresh binding.`,
          );
        }
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
        const digestHex = Array.from(digest)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const bcanonText = `${buf.byteLength} bytes — sha256:${digestHex.slice(0, 16)}…${digestHex.slice(-8)} (uploaded; must match .p7s messageDigest)`;
        // Mark "downloaded" so the Continue button enables — the user
        // already has the file on disk; no re-download needed.
        setDownloaded(true);
        downloadFiredRef.current = true;
        setState({ kind: 'ready', bindingBytes: buf, bcanonText });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      }
    })();
  };

  // Auto-download (only): once the binding is built, push the file to
  // the user's machine immediately. The wallet-sign that builds the
  // binding stays user-triggered — clicking the wallet popup is too
  // load-bearing to fire on mount. Browsers may also block the
  // programmatic `a.click()` that triggers the download; the explicit
  // Download button below handles that fallback path.
  useEffect(() => {
    if (state.kind !== 'ready' || downloadFiredRef.current) return;
    downloadFiredRef.current = true;
    downloadBindingFile(state.bindingBytes);
    setDownloaded(true);
  }, [state]);

  const retry = (): void => {
    generateStartedRef.current = false;
    downloadFiredRef.current = false;
    setDownloaded(false);
    setState({ kind: 'idle' });
  };

  return (
    <section
      aria-labelledby="step2-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <h2 id="step2-heading" style={HEADING_STYLE}>
        {t('registerV5.step2.title')}
      </h2>
      <p style={BODY_STYLE}>
        {t(
          'registerV5.step2.body',
          'We will ask your wallet to sign a deterministic recovery message so we can include your public key in the binding. The signature itself is discarded.',
        )}
      </p>
      {state.kind === 'idle' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void onGenerate()}
            data-testid="v5-generate-binding-cta"
            className="cv-btn is-blue"
          >
            ▶ Generate binding (wallet sign)
          </button>
          <label
            className="cv-btn is-ghost"
            style={{ cursor: 'pointer' }}
            data-testid="v5-upload-binding-cta"
          >
            ⤒ Upload existing binding.qkb2.json
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}
      {state.kind === 'recovering' && (
        <p
          role="status"
          data-testid="v5-binding-recovering"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '13px',
            color: 'var(--ct-mute)',
          }}
        >
          ⌛ Awaiting wallet signature for pubkey recovery…
        </p>
      )}
      {state.kind === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p
            role="alert"
            data-testid="v5-binding-error"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '13px',
              color: 'var(--err)',
            }}
          >
            {state.message}
          </p>
          <button type="button" onClick={retry} className="cv-btn" style={{ alignSelf: 'flex-start' }}>
            ⟲ Retry
          </button>
        </div>
      )}
      {state.kind === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p
            data-testid="v5-binding-preview-meta"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11.5px',
              color: 'var(--ct-mute)',
              letterSpacing: '.04em',
            }}
          >
            {state.bcanonText}
          </p>
          <BindingPreview bytes={state.bindingBytes} />
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '12.5px',
              maxWidth: '64ch',
              color: 'var(--ct-ink)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {downloaded
              ? '✓ binding.qkb2.json downloaded. Open Diia (or your QTSP client), sign the file with your QES — you get a .p7s back. Drop the .p7s into Step 3. If the download did not start, hit the button below.'
              : '⌛ Auto-downloading binding.qkb2.json. If your browser blocked it, hit the button below.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                downloadBindingFile(state.bindingBytes);
                setDownloaded(true);
              }}
              data-testid="v5-binding-download"
              className={downloaded ? 'cv-btn is-ghost' : 'cv-btn is-blue'}
            >
              ⤓ {downloaded ? 'Re-download' : 'Download'} binding.qkb2.json
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '16px' }}>
        {!hideBack && (
          <button
            type="button"
            onClick={onBack}
            className="cv-btn is-ghost"
          >
            {t('registerV5.step2.back')}
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={state.kind !== 'ready' || !downloaded}
          data-testid="v5-binding-advance-cta"
          className="cv-btn"
          aria-disabled={state.kind !== 'ready' || !downloaded}
        >
          ▶ Sign with QES →
        </button>
      </div>
    </section>
  );
}

/**
 * Render the JCS-canonical binding bytes as readable JSON. The actual
 * file the user downloads has no whitespace (RFC 8785 deterministic
 * canonicalization is what the V5 circuit consumes), but for the
 * on-screen preview we re-pretty-print so the user can visually verify
 * what they are about to sign with their QES.
 */
function BindingPreview({ bytes }: { bytes: Uint8Array }) {
  let pretty: string;
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    pretty = JSON.stringify(parsed, null, 2);
  } catch {
    pretty = `<unable to decode ${bytes.byteLength} bytes>`;
  }
  return (
    <pre
      data-testid="v5-binding-preview"
      style={{
        background: '#fff',
        border: '2px solid var(--ct-ink, #1a1a1a)',
        margin: 0,
        padding: '12px 14px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        lineHeight: 1.55,
        color: 'var(--ct-ink, #1a1a1a)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        maxHeight: 320,
        overflow: 'auto',
      }}
    >{pretty}</pre>
  );
}
