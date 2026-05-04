// /ua/registerV5 — civic-terminal v2 variant gate.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 9.
//
// We assert the variant-gate flips between the legacy civic-monumental
// body (default) and the new civic-terminal v2 shell when
// `?variant=civic-terminal` is present. We do NOT exercise the Step1–4
// flow internals here — those are covered by existing Playwright e2e
// (flow-happy.spec.ts, v5-flow.spec.ts).

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useNavigate: () => () => undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) =>
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>,
}));

// Stub out the V5 step components — heavyweight, not under test here.
vi.mock('../../src/components/ua/v5/Step1ConnectWallet', () => ({
  Step1ConnectWallet: () => <div data-testid="step1-stub">step1</div>,
}));
vi.mock('../../src/components/ua/v5/Step2GenerateBinding', () => ({
  Step2GenerateBinding: () => <div data-testid="step2-stub">step2</div>,
}));
vi.mock('../../src/components/ua/v5/Step3DiiaSign', () => ({
  Step3DiiaSign: () => <div data-testid="step3-stub">step3</div>,
}));
vi.mock('../../src/components/ua/v5/Step4ProveAndRegister', () => ({
  Step4ProveAndRegister: () => <div data-testid="step4-stub">step4</div>,
}));
vi.mock('../../src/components/ua/v5/StepIndicatorV5', () => ({
  StepIndicatorV5: () => <div data-testid="legacy-step-indicator" />,
}));
// V2 chrome — stubbed so we just assert presence.
vi.mock('../../src/components/app/DeviceReadinessGate', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DeviceReadinessGate: ({ children }: { children: any }) => (
    <div data-testid="device-readiness-gate">{children}</div>
  ),
}));
vi.mock('../../src/components/app/PreviewModeBanner', () => ({
  PreviewModeBanner: () => <div data-testid="preview-mode-banner" />,
}));
vi.mock('../../src/components/civic-terminal/FooterRibbon', () => ({
  FooterRibbon: () => <div data-testid="footer-ribbon" />,
}));
// Legacy chrome — also stubbed to avoid unrelated side effects.
vi.mock('../../src/components/PaperGrain', () => ({
  PaperGrain: () => <div data-testid="legacy-paper-grain" />,
}));
vi.mock('../../src/components/DocumentFooter', () => ({
  DocumentFooter: () => <div data-testid="legacy-document-footer" />,
}));
// Legacy assessDeviceCapability — resolves ready so the body renders.
vi.mock('../../src/lib/deviceGate', () => ({
  assessDeviceCapability: () =>
    Promise.resolve({ kind: 'ready', quotaBytes: 1, persistGranted: true }),
}));

import { RegisterV5Screen } from '../../src/routes/ua/registerV5';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Reset the URL between tests so the variant flag doesn't leak.
  window.history.pushState({}, '', '/');
});

describe('RegisterV5Screen variant gate', () => {
  it('renders the civic-terminal v2 shell when variant=civic-terminal', () => {
    window.history.pushState({}, '', '/ua/registerV5?variant=civic-terminal');
    render(<RegisterV5Screen />);
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('device-readiness-gate')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    expect(screen.getByTestId('register-v2-step-strip')).toBeInTheDocument();
    // Legacy chrome must NOT render in v2 mode.
    expect(screen.queryByTestId('legacy-paper-grain')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legacy-document-footer')).not.toBeInTheDocument();
    // Active step is Step 1.
    expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
  });

  it('renders the legacy civic-monumental body when variant flag absent', () => {
    window.history.pushState({}, '', '/ua/registerV5');
    render(<RegisterV5Screen />);
    expect(screen.getByTestId('legacy-paper-grain')).toBeInTheDocument();
    // The legacy body keeps assessDeviceCapability + the device-gate
    // pending placeholder until the promise resolves; the stubbed
    // assessDeviceCapability resolves on a microtask so the placeholder
    // is what renders in the synchronous tick.
    expect(screen.getByTestId('v5-device-gate-pending')).toBeInTheDocument();
    // V2 chrome must NOT render.
    expect(screen.queryByTestId('preview-mode-banner')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('device-readiness-gate'),
    ).not.toBeInTheDocument();
  });

  it('exposes the STEP N of 4 sticky-header strip in v2 mode', () => {
    window.history.pushState({}, '', '/ua/registerV5?variant=civic-terminal');
    render(<RegisterV5Screen />);
    const strip = screen.getByTestId('register-v2-step-strip');
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent(/STEP 1 of 4 · CONNECT WALLET/);
  });
});
