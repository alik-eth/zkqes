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

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { Step1ConnectWallet } from '../../components/ua/v5/Step1ConnectWallet';
import { Step2GenerateBinding } from '../../components/ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../../components/ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../../components/ua/v5/Step4ProveAndRegister';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { TestnetBanner } from '../../components/app/TestnetBanner';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';
import { QTSP_INDEX } from '../../generated/qtsp-index';
import { QtspScopeContext, resolveQtspScope } from '../../lib/qtspScope';

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

export interface RegisterV5ScreenProps {
  /**
   * Optional search-params bag. The route wrapper passes
   * `useSearch({ strict: false })`; tests + standalone callers can
   * pass a literal `{ qtsp?: string }`. Multi-QTSP facade T13:
   * `qtsp` is a `<cc>/<slug>` path against `QTSP_INDEX`; on resolve
   * the meta scopes the register-flow surface (signing-tool prompt,
   * `cert.berInput` error templates). On miss / malformed / bronze
   * the scope falls back to UA-default (null context) per spec §4.4.
   */
  searchParams?: { qtsp?: string };
}

export function RegisterV5Screen({ searchParams }: RegisterV5ScreenProps = {}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);
  const qtspScope = useMemo(
    () => resolveQtspScope(searchParams?.qtsp, QTSP_INDEX),
    [searchParams?.qtsp],
  );

  return (
    <QtspScopeContext.Provider value={qtspScope}>
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
    >
      <TestnetBanner />
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
          {qtspScope && (
            // Multi-QTSP facade T13: scoped-tool prompt.  Surfaces the
            // active QTSP's signing-tool name so the user sees which
            // QES app they should be using before they hit Step 3.
            // UA-default (qtspScope=null) keeps existing copy as-is.
            <p
              data-testid="qtsp-scope-banner"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '13px',
                color: 'var(--ct-mute)',
                marginTop: '8px',
              }}
            >
              {qtspScope.displayName} · {qtspScope.signingTool.name}
            </p>
          )}
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
    </QtspScopeContext.Provider>
  );
}

/**
 * Route wrapper — reads `?qtsp=` from TanStack Router and threads it
 * into `RegisterV5Screen`. Default export so `lazyRouteComponent`
 * picks it up; both `/ua/registerV5` and `/v5/registerV5` route
 * declarations point at this same component.
 *
 * `useSearch({ strict: false })` accepts any search-param shape
 * without requiring a per-route schema. The cast narrows it to the
 * `qtsp` field this component cares about; unrecognized params
 * pass through untouched.
 */
export default function RegisterV5Route(): JSX.Element {
  const search = useSearch({ strict: false }) as { qtsp?: string };
  return <RegisterV5Screen searchParams={search} />;
}
