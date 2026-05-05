/**
 * V5.1 SCW (smart contract wallet) passphrase opt-in modal.
 *
 * Per orchestration §1.2 wallet-secret derivation: SCWs cannot run the
 * deterministic personal_sign HKDF path because their on-chain signature
 * verification logic is non-deterministic across chain forks (an SCW
 * could change its `isValidSignature` implementation between the time
 * the secret was derived and any later rotation, breaking re-derivation).
 * SCW users instead derive the wallet-secret from a user-chosen passphrase
 * via Argon2id. The salt binds the derivation to the wallet address so
 * the same passphrase used with two different SCWs produces two different
 * secrets.
 *
 * UX gates surfaced here:
 *   - Loud warning: "if you lose this passphrase, you cannot recover your
 *     identity, even with a valid Diia QES." This is the cold truth of the
 *     SCW path; deferring or sugar-coating it would put users at material
 *     risk later.
 *   - Strength meter via zxcvbn (lazy-loaded; EOA users don't pay the
 *     bundle cost). Minimum target: ≥ 80 bits of guess-resistance per
 *     orchestration spec. The meter blocks submit until the threshold
 *     is met.
 *   - Opt-out: prominent "connect an EOA wallet instead" CTA. EOA is
 *     the recommended path for V5 alpha; SCW is opt-in.
 *
 * The modal calls back with the verified passphrase on submit. The caller
 * derives the wallet-secret via `deriveWalletSecretScw(passphrase, address)`
 * and threads it into the rest of the flow (Step4ProveAndRegister or
 * RotateWalletFlow). The modal does NOT itself derive — keeping derivation
 * close to the caller's existing walletSecret-handling code.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Minimum zxcvbn guess-log10 to satisfy the 80-bit target.
 *  log10(2^80) ≈ 24.08; we round up to 25 for headroom. zxcvbn's
 *  guesses_log10 is conservative against dictionary + pattern attacks. */
const MIN_GUESSES_LOG10 = 25;

export interface ScwPassphraseModalProps {
  /** Whether the modal is visible. Caller controls open/close state. */
  readonly open: boolean;
  /** SCW wallet address. Displayed in modal copy + used by caller for
   *  Argon2id salt binding. */
  readonly walletAddress: `0x${string}`;
  /** Submit handler. Receives the user-entered passphrase. The caller
   *  is responsible for the Argon2id derivation + threading the secret. */
  readonly onSubmit: (passphrase: string) => void | Promise<void>;
  /** Cancel handler — typically dismisses the modal AND surfaces
   *  the "connect EOA" CTA in the parent. */
  readonly onCancel: () => void;
  /** True while the parent runs the (slow) Argon2id derivation. The modal
   *  shows a status message and disables submit while this is true. */
  readonly isDeriving?: boolean;
}

interface ZxcvbnResult {
  guesses_log10: number;
  score: 0 | 1 | 2 | 3 | 4;
  feedback: { warning: string; suggestions: string[] };
}

export function ScwPassphraseModal({
  open,
  walletAddress,
  onSubmit,
  onCancel,
  isDeriving = false,
}: ScwPassphraseModalProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [revealed, setRevealed] = useState(false);
  // `scoredPassphrase` holds the EXACT passphrase string that produced
  // the current `strength`. Submit is gated on `scoredPassphrase === passphrase`
  // so an async-in-flight zxcvbn call can never green-light a weakened
  // input — the score is only trusted when it provably matches what's
  // in the textbox right now.
  const [scoredPassphrase, setScoredPassphrase] = useState('');
  const [strength, setStrength] = useState<ZxcvbnResult | null>(null);
  const [zxcvbnLoading, setZxcvbnLoading] = useState(false);

  // Lazy load zxcvbn the first time the user types. Keeps the bundle
  // off the EOA path (which is the recommended/default flow).
  useEffect(() => {
    if (!open || passphrase.length === 0) {
      setStrength(null);
      setScoredPassphrase('');
      setZxcvbnLoading(false);
      return;
    }
    let cancelled = false;
    setZxcvbnLoading(true);
    void (async () => {
      const mod = await import('zxcvbn');
      if (cancelled) return;
      const result = mod.default(passphrase);
      setStrength({
        guesses_log10: result.guesses_log10,
        score: result.score,
        feedback: {
          warning: result.feedback.warning ?? '',
          suggestions: result.feedback.suggestions ?? [],
        },
      });
      setScoredPassphrase(passphrase);  // pin score to THIS input value
      setZxcvbnLoading(false);
    })().catch(() => {
      if (!cancelled) setZxcvbnLoading(false);
    });
    return () => { cancelled = true; };
  }, [passphrase, open]);

  if (!open) return null;

  // Gate: score must exist, meet threshold, AND have been computed
  // against the currently-displayed passphrase. The third condition
  // closes the React-render-vs-async-effect race window codex flagged:
  // even if `strength` is stale (recompute in flight), submit stays
  // disabled until `scoredPassphrase` catches up to the input.
  const meetsThreshold = strength !== null
    && strength.guesses_log10 >= MIN_GUESSES_LOG10
    && scoredPassphrase === passphrase;
  const canSubmit = meetsThreshold && !zxcvbnLoading && !isDeriving;

  // Civic-terminal v2 tokens — backdrop is --ct-ink at 70% alpha
  // (matches the surface ink), dialog itself is --ct-paper-2 (the
  // lighter civic-terminal panel inset). Warning aside uses --err
  // for both border and text since the SCW-loss warning IS a hard
  // alert (you cannot recover the identity if the passphrase is lost).
  const monoXs: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: '12px',
    color: 'var(--ct-mute)',
    margin: 0,
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scw-passphrase-heading"
      data-testid="scw-passphrase-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 26, 26, 0.7)',  // var(--ct-ink) at 70% alpha
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '512px',
          width: '100%',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          background: 'var(--ct-paper-2)',
          color: 'var(--ct-ink)',
          border: '1.5px solid var(--ct-ink)',
        }}
      >
        <h2
          id="scw-passphrase-heading"
          style={{
            fontFamily: 'var(--display)',
            fontSize: '36px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--ct-ink)',
          }}
        >
          {t('scwPassphrase.title')}
        </h2>
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '14px',
            lineHeight: 1.5,
            margin: 0,
            color: 'var(--ct-ink)',
          }}
        >
          {t('scwPassphrase.body')}
        </p>
        <p style={monoXs}>
          {t('scwPassphrase.walletLabel')} {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </p>

        {/* Loud warning — civic-terminal --err border + text. */}
        <aside
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            border: '1.5px solid var(--err)',
            color: 'var(--err)',
            fontFamily: 'var(--mono)',
            fontSize: '13px',
          }}
          data-testid="scw-passphrase-warning"
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{t('scwPassphrase.warningTitle')}</p>
          <p style={{ margin: 0 }}>{t('scwPassphrase.warningBody')}</p>
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label
            htmlFor="scw-passphrase-input"
            style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--ct-mute)' }}
          >
            {t('scwPassphrase.inputLabel')}
          </label>
          <input
            id="scw-passphrase-input"
            type={revealed ? 'text' : 'password'}
            data-testid="scw-passphrase-input"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            disabled={isDeriving}
            autoComplete="new-password"
            spellCheck={false}
            className="ct-input ct-input--paper"
          />
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            disabled={isDeriving}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '12px',
              color: 'var(--ct-mute)',
              textDecoration: 'underline',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              alignSelf: 'flex-start',
            }}
          >
            {revealed ? t('scwPassphrase.hide') : t('scwPassphrase.reveal')}
          </button>
        </div>

        {/* Strength meter. Uses zxcvbn guesses_log10 for a continuous
            measure rather than the 0-4 score (which collapses too many
            states for our 80-bit floor). */}
        {passphrase.length > 0 && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            data-testid="scw-passphrase-strength"
          >
            <p style={monoXs}>
              {zxcvbnLoading
                ? t('scwPassphrase.computing')
                : strength
                  ? t('scwPassphrase.strength', {
                      bits: Math.round(strength.guesses_log10 * 3.32193),
                      target: 80,
                    })
                  : ''}
            </p>
            {strength?.feedback.warning && (
              <p
                style={{ ...monoXs, color: 'var(--err)' }}
                data-testid="scw-passphrase-feedback-warning"
              >
                {strength.feedback.warning}
              </p>
            )}
            {strength && strength.feedback.suggestions.length > 0 && (
              <ul
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '12px',
                  color: 'var(--ct-mute)',
                  listStyle: 'disc inside',
                  margin: 0,
                  paddingLeft: 0,
                }}
              >
                {strength.feedback.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isDeriving && (
          <p
            role="status"
            data-testid="scw-passphrase-deriving"
            style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--ct-mute)', margin: 0 }}
          >
            {t('scwPassphrase.deriving')}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
          <button
            type="button"
            onClick={() => void onSubmit(passphrase)}
            disabled={!canSubmit}
            data-testid="scw-passphrase-submit"
            className="ct-btn"
            style={{
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {t('scwPassphrase.submit')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeriving}
            data-testid="scw-passphrase-use-eoa"
            className="ct-btn"
            style={{
              opacity: isDeriving ? 0.5 : 1,
              cursor: isDeriving ? 'not-allowed' : 'pointer',
            }}
          >
            {t('scwPassphrase.useEoaInstead')}
          </button>
        </div>
      </div>
    </div>
  );
}
