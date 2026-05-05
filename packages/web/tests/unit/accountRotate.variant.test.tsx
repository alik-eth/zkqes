// /account/rotate — civic-terminal v3 shell tests.
//
// Task #87 (2026-05-05): the v3 chrome (Marquee + ASCII rotation diagram +
// 960px column) wraps RotateWalletFlow per the founder pick from the
// Claude Design handoff bundle. RotateWalletFlow's 965-line internals +
// V5.1 byte-locks are PRESERVED VERBATIM per packages/web/CLAUDE.md
// invariant 10 — this test just pins the chrome composition.

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
vi.mock('../../src/components/app/TestnetBanner', () => ({
  TestnetBanner: () => <div data-testid="testnet-banner" />,
}));
vi.mock('../../src/components/civic-terminal/Marquee', () => ({
  Marquee: ({ sidebarText }: { sidebarText?: string }) => (
    <div data-testid="marquee" data-sidebar={sidebarText} />
  ),
}));
vi.mock('../../src/components/civic-terminal/FooterRibbon', () => ({
  FooterRibbon: () => <div data-testid="footer-ribbon" />,
}));
vi.mock('../../src/hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: () => ({ phase: 'recruiting', status: { round: 0, totalRounds: 1 } }),
}));
vi.mock('@tanstack/react-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { AccountRotateScreen } from '../../src/routes/account/rotate';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('AccountRotateScreen v3 shell', () => {
  it('wraps RotateWalletFlow in the v3 chrome at default /account/rotate', () => {
    window.history.pushState({}, '', '/account/rotate');
    render(<AccountRotateScreen />);
    expect(screen.getByTestId('account-rotate-v3-shell')).toBeInTheDocument();
    expect(screen.getByTestId('testnet-banner')).toBeInTheDocument();
    expect(screen.getByTestId('preview-mode-banner')).toBeInTheDocument();
    expect(screen.getByTestId('marquee')).toBeInTheDocument();
    expect(screen.getByTestId('account-rotate-v3-diagram')).toBeInTheDocument();
    expect(screen.getByTestId('device-readiness-gate')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    expect(screen.getByTestId('rotate-flow-stub')).toBeInTheDocument();
  });

  it('also renders the v3 chrome when ?variant=civic-terminal is present (no-op gate retired)', () => {
    window.history.pushState({}, '', '/account/rotate?variant=civic-terminal');
    render(<AccountRotateScreen />);
    expect(screen.getByTestId('account-rotate-v3-shell')).toBeInTheDocument();
    expect(screen.getByTestId('rotate-flow-stub')).toBeInTheDocument();
  });
});
