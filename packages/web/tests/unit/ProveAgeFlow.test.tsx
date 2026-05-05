/**
 * V5.4 — `ProveAgeFlow` unit tests.
 *
 * Phase A scope: pin the civic-terminal v3 chrome composition + the
 * 4-step state machine entry point + cutoff-default + result-rendering
 * for both ageQualified branches. Real prover (snarkjs in-Worker) +
 * binding picker + on-chain submit land in T5 (Phase C); today's
 * tests run against MockProver and the bindingId stub.
 *
 * Strategy: mock `buildAgeWitness` so the component-level tests don't
 * hit `parseP7s` byte parsing on a Uint8Array(0). The witness builder
 * itself has separate unit tests in
 * `@zkqes/sdk` `src/witness/v5_4/build-age-witness.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@zkqes/sdk', async () => {
  // Pull the real module so MockProver and types still come through;
  // override only the witness builder so the component test doesn't
  // exercise byte parsing on synthetic input.
  const actual = await vi.importActual<typeof import('@zkqes/sdk')>('@zkqes/sdk');
  return {
    ...actual,
    buildAgeWitness: vi.fn(),
  };
});

// Mock the chrome primitives + i18n so the component test stays focused
// on the state machine + result rendering. Real chrome composition is
// pinned by the v3 surface family tests already in tests/unit/.
vi.mock('@tanstack/react-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));
vi.mock('../../src/components/civic-terminal/Marquee', () => ({
  Marquee: () => <div data-testid="marquee" />,
}));
vi.mock('../../src/components/civic-terminal/FooterRibbon', () => ({
  FooterRibbon: () => <div data-testid="footer-ribbon" />,
}));
vi.mock('../../src/hooks/useCeremonyPhase', () => ({
  useCeremonyPhase: () => ({
    phase: 'recruiting',
    status: { round: 0, totalRounds: 1 },
    error: null,
  }),
}));
// Default to "wallet connected" for the happy-path tests so the flow
// auto-advances past the connect step. The connect-step assertion has
// its own dedicated test that overrides this.
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({ isConnected: true, address: '0x' + 'a'.repeat(40) })),
}));
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: () => <button type="button">connect wallet</button>,
}));

import { buildAgeWitness, MockProver, type IProver } from '@zkqes/sdk';
import { useAccount } from 'wagmi';

import { ProveAgeFlow } from '../../src/components/account/ProveAgeFlow';

const mockedBuild = vi.mocked(buildAgeWitness);

// JSDOM's File class lacks `arrayBuffer()` until Node 20.10+; the
// component's onP7sChange uses it. Polyfill via the file's bytes — the
// fixtures we feed in are tiny Uint8Arrays the File constructor
// already retained.
if (typeof File.prototype.arrayBuffer !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (File.prototype as any).arrayBuffer = async function arrayBuffer(): Promise<ArrayBuffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = new FileReader();
    return new Promise<ArrayBuffer>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockedBuild.mockReset();
  vi.mocked(useAccount).mockImplementation(() => ({
    isConnected: true,
    address: ('0x' + 'a'.repeat(40)) as `0x${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any));
});

describe('ProveAgeFlow — V5.4 civic-terminal v3 surface', () => {
  it('renders the v3 shell + Marquee + FooterRibbon + cutoff step at default state', () => {
    render(<ProveAgeFlow prover={new MockProver()} />);
    expect(screen.getByTestId('prove-age-v3-shell')).toBeInTheDocument();
    expect(screen.getByTestId('marquee')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    // Wallet auto-connect mock advances past 'connect' to 'cutoff'.
    expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
  });

  it('renders the connect step when wallet is disconnected', () => {
    vi.mocked(useAccount).mockImplementation(() => ({
      isConnected: false,
      address: undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
    render(<ProveAgeFlow prover={new MockProver()} />);
    expect(screen.getByTestId('prove-age-step-connect')).toBeInTheDocument();
    expect(screen.queryByTestId('prove-age-step-cutoff')).not.toBeInTheDocument();
  });

  it('cutoff input defaults to today − 18 years (YYYY-MM-DD)', () => {
    const fakeNow = new Date('2026-05-05T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);
    try {
      render(<ProveAgeFlow prover={new MockProver()} />);
      const cutoff = screen.getByTestId('prove-age-cutoff-input') as HTMLInputElement;
      expect(cutoff.value).toBe('2008-05-05');
    } finally {
      vi.useRealTimers();
    }
  });

  it('drives cutoff → p7s → prove → result with ageQualified=1', async () => {
    mockedBuild.mockResolvedValue({
      witness: { ageCutoffDateIn: 20070101, nullifierCtxInput: '1', leafCertBytes: [], sdaFrameOffsetInTbs: 0 },
      publicSignals: { ageQualified: 1, ageCutoffDate: 20070101, nullifierCtx: '1' },
      dobYmd: 20060101,
    });
    const prover: IProver = new MockProver();
    render(<ProveAgeFlow prover={prover} />);

    // Step 2 → 3
    fireEvent.click(screen.getByTestId('prove-age-cutoff-advance'));
    expect(screen.getByTestId('prove-age-step-p7s')).toBeInTheDocument();

    // File upload — synthetic .p7s bytes; the buildAgeWitness mock
    // returns canned output regardless.
    const file = new File([new Uint8Array([0x30, 0x82, 0, 0])], 'fake.p7s', {
      type: 'application/pkcs7-signature',
    });
    fireEvent.change(screen.getByTestId('prove-age-p7s-input'), {
      target: { files: [file] },
    });
    // The component's onP7sChange does file.arrayBuffer().then(setP7s)
    // — wait for the prove button to enable before clicking.
    await waitFor(() => {
      expect((screen.getByTestId('prove-age-prove') as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId('prove-age-prove'));

    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-result')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prove-age-result-qualified')).toBeInTheDocument();
    expect(screen.getByTestId('prove-age-submit-pending')).toBeInTheDocument();
  });

  it('renders the not-qualified result when ageQualified=0', async () => {
    mockedBuild.mockResolvedValue({
      witness: { ageCutoffDateIn: 20070101, nullifierCtxInput: '1', leafCertBytes: [], sdaFrameOffsetInTbs: 0 },
      publicSignals: { ageQualified: 0, ageCutoffDate: 20070101, nullifierCtx: '1' },
      dobYmd: 20100101,
    });
    render(<ProveAgeFlow prover={new MockProver()} />);

    fireEvent.click(screen.getByTestId('prove-age-cutoff-advance'));
    const file = new File([new Uint8Array([0x30])], 'fake.p7s');
    fireEvent.change(screen.getByTestId('prove-age-p7s-input'), {
      target: { files: [file] },
    });
    // The component's onP7sChange does file.arrayBuffer().then(setP7s)
    // — wait for the prove button to enable before clicking.
    await waitFor(() => {
      expect((screen.getByTestId('prove-age-prove') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('prove-age-prove'));

    await waitFor(() => {
      expect(screen.getByTestId('prove-age-result-not-qualified')).toBeInTheDocument();
    });
  });

  it('shows error step when buildAgeWitness throws (e.g. unsupported DOB encoding)', async () => {
    mockedBuild.mockRejectedValue(new Error('diia-ua-extraction-failed'));
    render(<ProveAgeFlow prover={new MockProver()} />);

    fireEvent.click(screen.getByTestId('prove-age-cutoff-advance'));
    const file = new File([new Uint8Array([0x30])], 'fake.p7s');
    fireEvent.change(screen.getByTestId('prove-age-p7s-input'), {
      target: { files: [file] },
    });
    // The component's onP7sChange does file.arrayBuffer().then(setP7s)
    // — wait for the prove button to enable before clicking.
    await waitFor(() => {
      expect((screen.getByTestId('prove-age-prove') as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId('prove-age-prove'));

    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-error')).toBeInTheDocument();
    });
  });

  it('blocks the prove button when no .p7s has been uploaded', () => {
    render(<ProveAgeFlow prover={new MockProver()} />);
    fireEvent.click(screen.getByTestId('prove-age-cutoff-advance'));
    const proveBtn = screen.getByTestId('prove-age-prove') as HTMLButtonElement;
    expect(proveBtn.disabled).toBe(true);
  });
});
