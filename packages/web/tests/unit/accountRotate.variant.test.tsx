// /account/rotate variant gate.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 10.

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

describe('AccountRotateScreen variant gate', () => {
  it('renders the v2 shell when variant=civic-terminal', () => {
    window.history.pushState({}, '', '/account/rotate?variant=civic-terminal');
    render(<AccountRotateScreen />);
    expect(screen.getByTestId('account-rotate-v2-shell')).toBeInTheDocument();
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('device-readiness-gate')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    // Inner flow renders inside the gate (per the order of nested children).
    expect(screen.getByTestId('rotate-flow-stub')).toBeInTheDocument();
  });

  it('renders RotateWalletFlow directly when variant flag absent (legacy)', () => {
    window.history.pushState({}, '', '/account/rotate');
    render(<AccountRotateScreen />);
    expect(
      screen.queryByTestId('account-rotate-v2-shell'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-mode-banner')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('device-readiness-gate'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('rotate-flow-stub')).toBeInTheDocument();
  });
});
