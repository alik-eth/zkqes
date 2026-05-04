// /ua/registerV5 — UA holder registration entry point.
//
// Civic-monumental flow (the legacy default body) is still the production
// path. The civic-terminal v2 variant (gated behind `?variant=civic-terminal`
// per plan Task 9 + spec §5.1) wraps the same Step1–Step4 components in the
// v2 chrome:
//
//   <DeviceReadinessGate>      — Firefox≥120 + RAM OR `zkqes serve` CLI
//   <PreviewModeBanner />      — emits when phase != live
//   sticky-header strip        — STEP N of 4 + per-step label
//   single-step rendering      — Step1..4 reused as-is; advance on callback
//   <FooterRibbon />           — sha · date · zkqes.org
//
// Plan-deviation, flagged in the commit: the plan envisions all four
// step components rendered SIMULTANEOUSLY (single-long-form, scrolling
// document). The existing Step components were authored for one-at-a-time
// rendering with `onAdvance` callbacks driving navigation; rendering them
// stacked would either mount four wallet connection probes / Diia upload
// inputs at once, or require an internal refactor the plan explicitly
// proscribes ("Don't refactor the steps' internals; just wire them
// stacked"). Compromise: keep the existing one-at-a-time UX inside the
// new shell so the visual rebrand ships safely now; the all-stacked
// document layout becomes a follow-up if lead + marketer want it. The
// load-bearing v2 deliverables (DeviceReadinessGate, PreviewModeBanner,
// civic-terminal chrome, max-width 720px) all ship in this commit.
//
// Variant-gating strategy: same as /ceremony + /verify — legacy body
// stays default, retiring at Task 13 atomic flip alongside the new
// Playwright e2e.

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { DocumentFooter } from '../../components/DocumentFooter';
import { PaperGrain } from '../../components/PaperGrain';
import { Step1ConnectWallet } from '../../components/ua/v5/Step1ConnectWallet';
import { Step2GenerateBinding } from '../../components/ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../../components/ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../../components/ua/v5/Step4ProveAndRegister';
import { StepIndicatorV5 } from '../../components/ua/v5/StepIndicatorV5';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';
import { assessDeviceCapability } from '../../lib/deviceGate';

type StepNumber = 1 | 2 | 3 | 4;
type GateState = 'pending' | 'ready' | 'denied';

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
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('variant') ===
      'civic-terminal'
  ) {
    return <RegisterV5CivicTerminal />;
  }
  return <RegisterV5Legacy />;
}

// --------------------------------------------------------------------- //
// Civic-terminal v2 shell (per plan Task 9 + spec §5.1).                 //
// Wraps the existing Step1–Step4 orchestration in DeviceReadinessGate +  //
// PreviewModeBanner + civic-terminal chrome. The `assessDeviceCapability`//
// redirect to /ua/use-desktop is REPLACED by the dual-path (browser +    //
// CLI) gate from Task 8 — denied users see option A + option B inline    //
// rather than a redirect to a separate page.                             //
// --------------------------------------------------------------------- //
function RegisterV5CivicTerminal() {
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

// --------------------------------------------------------------------- //
// Legacy civic-monumental body — preserved verbatim.                     //
// Default `/ua/registerV5` until Task 13's atomic flip; existing         //
// Playwright e2e (flow-happy.spec.ts, v5-register-route.spec.ts,         //
// v5-device-gating.spec.ts, v5-flow.spec.ts) all assert against this     //
// body.                                                                  //
// --------------------------------------------------------------------- //
function RegisterV5Legacy() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);
  // Device-capability gate (spec amendment 9c866ad). Runs BEFORE Step 1 is
  // shown so the user can't even start connecting a wallet on a device
  // that can't finish the proof. Out-of-gate → /ua/use-desktop.
  const [gate, setGate] = useState<GateState>('pending');

  useEffect(() => {
    let cancelled = false;
    assessDeviceCapability()
      .then((result) => {
        if (cancelled) return;
        if (result.kind === 'denied') {
          setGate('denied');
          void navigate({ to: '/ua/use-desktop' });
        } else {
          setGate('ready');
        }
      })
      .catch(() => {
        // Detection itself failed — be conservative and reroute. The user
        // can still get back via the ← back link on /ua/use-desktop.
        if (cancelled) return;
        setGate('denied');
        void navigate({ to: '/ua/use-desktop' });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (gate !== 'ready') {
    // Render a minimal placeholder while the gate runs (typically <50ms).
    // Once denied, navigation kicks in and this component unmounts; until
    // then we don't want to flash Step 1.
    return (
      <main className="relative min-h-screen">
        <PaperGrain />
        <div className="doc-grid pt-24 relative z-10">
          <div />
          <div className="max-w-3xl" data-testid="v5-device-gate-pending" />
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen">
      <PaperGrain />
      <div className="doc-grid pt-24 relative z-10">
        <div />
        <div className="max-w-3xl space-y-12">
          <header className="space-y-6">
            <h1 className="text-5xl leading-none" style={{ color: 'var(--ink)' }}>
              {t('registerV5.title')}
            </h1>
            <p className="text-base max-w-prose" style={{ color: 'var(--ink)' }}>
              {t('registerV5.lede')}
            </p>
            <StepIndicatorV5 current={step} />
          </header>
          <hr className="rule" />
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
      </div>
      <DocumentFooter />
    </main>
  );
}
