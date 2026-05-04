// /ua/registerV5 — UA holder registration entry point.
//
// V2 atomic flip (Task 13, 2026-05-04): the legacy civic-monumental
// `RegisterV5Legacy` body + `?variant=civic-terminal` URL gate were
// deleted in this commit. The civic-terminal v2 shell — DeviceReadinessGate
// + PreviewModeBanner + sticky-header progress strip + 720px column +
// FooterRibbon — is the only renderer. Spec §5.1 / plan Task 9.
//
// Founder Q1 ACCEPT (2026-05-04): the step-at-a-time UX inside the v2
// shell is canonical. Spec §5.1 envisioned all 4 sections rendered
// SIMULTANEOUSLY (single-long-form, scrolling document); that's deferred
// to a V2.1 polish pass — the existing Step1–4 components carry V5.1
// byte-locks + walletSecret derivation that the all-stacked refactor
// would have to navigate. Step components reused as-is here.
//
// V5.0 redirect-to-/ua/use-desktop is REPLACED by the inline dual-path
// gate from Task 8 — denied users see option A (Firefox+RAM) + option B
// (zkqes serve CLI) inline rather than getting bounced to a separate
// page. The legacy `assessDeviceCapability` flow stays exported from
// lib/deviceGate.ts for any non-v2 consumer that hasn't migrated.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Step1ConnectWallet } from '../../components/ua/v5/Step1ConnectWallet';
import { Step2GenerateBinding } from '../../components/ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../../components/ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../../components/ua/v5/Step4ProveAndRegister';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';

type StepNumber = 1 | 2 | 3 | 4;

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

const STEP_LABELS: Record<StepNumber, string> = {
  1: 'CONNECT WALLET',
  2: 'GENERATE BINDING STATEMENT',
  3: 'SIGN WITH DIIA QES',
  4: 'PROVE & REGISTER',
};

export function RegisterV5Screen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
    >
      <PreviewModeBanner />
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '24px',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <header style={{ marginBottom: '24px' }}>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: '40px',
              color: 'var(--ct-ink)',
              margin: 0,
            }}
          >
            {t('registerV5.title', 'Register your identity')}
          </h1>
          <p style={{ fontFamily: 'var(--mono)', color: 'var(--ct-ink-2)' }}>
            {t(
              'registerV5.lede',
              'Four steps. Your private credentials never leave this browser — only a zero-knowledge proof reaches the chain.',
            )}
          </p>
        </header>

        {/* Sticky-header progress strip per spec §5.1. */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--ct-paper)',
            padding: '8px 0',
            fontFamily: 'var(--mono)',
            fontSize: '13px',
            borderBottom: '1px solid var(--ct-rule-soft)',
          }}
          data-testid="register-v2-step-strip"
        >
          <strong>
            STEP {step} of 4 · {STEP_LABELS[step]}
          </strong>
          <div
            style={{
              height: '4px',
              background: 'var(--ct-paper-3)',
              marginTop: '4px',
            }}
          >
            <div
              style={{
                width: `${(step / 4) * 100}%`,
                height: '100%',
                background: 'var(--ua-blue)',
              }}
              aria-label={`progress: step ${step} of 4`}
            />
          </div>
        </div>

        <DeviceReadinessGate>
          <div style={{ marginTop: '24px' }}>
            {step === 1 && <Step1ConnectWallet onAdvance={() => setStep(2)} />}
            {step === 2 && (
              <Step2GenerateBinding
                onAdvance={(bytes) => {
                  setBindingBytes(bytes);
                  setStep(3);
                }}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <Step3DiiaSign
                onP7s={(bytes) => {
                  setP7s(bytes);
                  setStep(4);
                }}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && p7s && bindingBytes && (
              <Step4ProveAndRegister
                p7s={p7s}
                bindingBytes={bindingBytes}
                onBack={() => setStep(3)}
              />
            )}
          </div>
        </DeviceReadinessGate>
      </div>
      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
  );
}
