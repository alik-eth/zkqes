// /account/rotate — civic-terminal v2 shell tests (post-Task-13).
//
// Variant-gate retired in Task 13's atomic flip; the v2 shell wrap is now
// the only renderer at `/account/rotate`. RotateWalletFlow's 965-line
// internals + V5.1 byte-locks are still preserved verbatim — this test
// just pins the chrome composition (banner + gate + footer wrapping the
// existing flow).

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../../src/components/ua/v5/RotateWalletFlow', () => ({
  RotateWalletFlow: () => <div data-testid="rotate-flow-stub">rotate flow</div>,
}));
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

import { AccountRotateScreen } from '../../src/routes/account/rotate';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('AccountRotateScreen v2 shell', () => {
  it('wraps RotateWalletFlow in the v2 chrome at default /account/rotate', () => {
    window.history.pushState({}, '', '/account/rotate');
    render(<AccountRotateScreen />);
    expect(screen.getByTestId('account-rotate-v2-shell')).toBeInTheDocument();
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('device-readiness-gate')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    expect(screen.getByTestId('rotate-flow-stub')).toBeInTheDocument();
  });

  it('also renders the v2 chrome when ?variant=civic-terminal is present (no-op gate retired)', () => {
    window.history.pushState({}, '', '/account/rotate?variant=civic-terminal');
    render(<AccountRotateScreen />);
    expect(screen.getByTestId('account-rotate-v2-shell')).toBeInTheDocument();
    expect(screen.getByTestId('rotate-flow-stub')).toBeInTheDocument();
  });
});
