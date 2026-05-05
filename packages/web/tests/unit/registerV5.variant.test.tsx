// /ua/registerV5 — civic-terminal v3 shell tests (post-Task-#87).
//
// V3 surface (2026-05-05): the v2 sticky-header step strip + 720px
// column was replaced by the "RegisterC_Document" notarised-filing
// chrome (Articles 1–5 + marginalia rail + page footer). These
// tests cover the load-bearing chrome (PreviewModeBanner +
// DeviceReadinessGate + document panel + Article shells + footer
// progress + QtspScope T13 banner) and pin the v3 testid surface.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => undefined,
  // T13: useSearch is consumed by the new RegisterV5Route default
  // export. Tests render `RegisterV5Screen` directly with explicit
  // `searchParams` props, so the mock just returns an empty object.
  useSearch: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) =>
    <a href={typeof to === 'string' ? to : '#'} {...rest}>{children}</a>,
}));

// wagmi hooks — Article 2 reads useAccount + useChainId for the
// live WALLET / NETWORK / CHAIN ID display. Default to disconnected
// so the v3 chrome's pre-connect "awaiting…" path is what renders.
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useChainId: () => undefined,
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
// V3 chrome dependencies — stubbed so we just assert presence.
vi.mock('../../src/components/app/DeviceReadinessGate', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DeviceReadinessGate: ({ children }: { children: any }) => (
    <div data-testid="device-readiness-gate">{children}</div>
  ),
}));
vi.mock('../../src/components/app/PreviewModeBanner', () => ({
  PreviewModeBanner: () => <div data-testid="preview-mode-banner" />,
}));
vi.mock('../../src/components/app/TestnetBanner', () => ({
  TestnetBanner: () => <div data-testid="testnet-banner" />,
}));
vi.mock('../../src/components/civic-terminal/FooterRibbon', () => ({
  FooterRibbon: () => <div data-testid="footer-ribbon" />,
}));

import { RegisterV5Screen } from '../../src/routes/ua/registerV5';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('RegisterV5Screen v3 shell', () => {
  it('renders the v3 chrome at default /ua/registerV5', () => {
    window.history.pushState({}, '', '/ua/registerV5');
    render(<RegisterV5Screen />);
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('device-readiness-gate')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    expect(screen.getByTestId('register-v3-shell')).toBeInTheDocument();
    expect(screen.getByTestId('register-v3-document')).toBeInTheDocument();
    // Step 1 lives inside Article 2; renders by default at step=1.
    expect(screen.getByTestId('step1-stub')).toBeInTheDocument();
  });

  it('also renders the v3 chrome when ?variant=civic-terminal is present (no-op gate retired)', () => {
    window.history.pushState({}, '', '/ua/registerV5?variant=civic-terminal');
    render(<RegisterV5Screen />);
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('device-readiness-gate')).toBeInTheDocument();
    expect(screen.getByTestId('register-v3-shell')).toBeInTheDocument();
  });

  it('exposes all five Article shells', () => {
    window.history.pushState({}, '', '/ua/registerV5');
    render(<RegisterV5Screen />);
    for (const n of [1, 2, 3, 4, 5] as const) {
      expect(screen.getByTestId(`register-v3-article-${n}`)).toBeInTheDocument();
    }
  });

  it('renders the marginalia rail (NOTARY + ANNOTATIONs + FILE STATE)', () => {
    window.history.pushState({}, '', '/ua/registerV5');
    render(<RegisterV5Screen />);
    expect(screen.getByTestId('register-v3-marginalia')).toBeInTheDocument();
  });

  it('renders the live progress counter element (driven by step machine state)', () => {
    window.history.pushState({}, '', '/ua/registerV5');
    render(<RegisterV5Screen />);
    // The counter exists; copy comes from i18n which is the bare key
    // in this test harness (no i18next instance). Live-locale assertion
    // would be redundant with i18n-coverage.test.ts.
    expect(screen.getByTestId('register-v3-progress')).toBeInTheDocument();
  });
});

// ── T13: ?qtsp= scope threading ──────────────────────────────────

describe('RegisterV5Screen — ?qtsp= scope (T13)', () => {
  it('reads ?qtsp=UA/diia and surfaces the scoped signing-tool name', () => {
    render(<RegisterV5Screen searchParams={{ qtsp: 'UA/diia' }} />);
    const banner = screen.getByTestId('qtsp-scope-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Diia mobile app');
    expect(banner.textContent).toContain('Diia');
  });

  it('case-insensitive on the slug — `ua/diia` resolves like `UA/diia`', () => {
    render(<RegisterV5Screen searchParams={{ qtsp: 'ua/diia' }} />);
    expect(screen.getByTestId('qtsp-scope-banner')).toBeInTheDocument();
  });

  it('falls back to UA-default (no scope banner) when ?qtsp is malformed', () => {
    render(<RegisterV5Screen searchParams={{ qtsp: 'this-is-garbage' }} />);
    expect(screen.queryByTestId('qtsp-scope-banner')).toBeNull();
    // V3 chrome still renders — the fallback path is observable as
    // "no scope banner", not "broken page".
    expect(screen.getByTestId('register-v3-shell')).toBeInTheDocument();
  });

  it('falls back to UA-default when ?qtsp resolves to a bronze entry (no register-flow surface)', () => {
    // No bronze entries in the live `QTSP_INDEX` today — UA/diia is
    // live, the only entry. We exercise the bronze branch of
    // `resolveQtspScope` indirectly: a slug not in the index also
    // falls back to UA-default per spec §4.4. Same observable
    // outcome as the bronze case (no scope banner).
    render(<RegisterV5Screen searchParams={{ qtsp: 'XX/nope' }} />);
    expect(screen.queryByTestId('qtsp-scope-banner')).toBeNull();
  });

  it('falls back to UA-default when ?qtsp is absent', () => {
    render(<RegisterV5Screen searchParams={{}} />);
    expect(screen.queryByTestId('qtsp-scope-banner')).toBeNull();
  });
});
