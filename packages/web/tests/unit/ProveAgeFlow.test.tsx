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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Stub TanStack Router's <Link> so the component renders without a
// wrapping <RouterProvider> (same pattern as CivicTerminalLanding).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children?: React.ReactNode; to?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', { href: typeof to === 'string' ? to : '#', ...rest }, children),
}));

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

// V5.4 binding resolver — mocked so tests can drive N=0 / N=1 / N>1
// branches without standing up a viem PublicClient + chain RPC.
vi.mock('../../src/hooks/useV5_4BindingsForWallet', () => ({
  useV5_4BindingsForWallet: vi.fn(),
}));

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
  useChainId: vi.fn(() => 84532),
  useWriteContract: vi.fn(() => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  })),
  useWaitForTransactionReceipt: vi.fn(() => ({
    isSuccess: false,
    data: undefined,
  })),
}));
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: () => <button type="button">connect wallet</button>,
}));

import { buildAgeWitness, MockProver, type IProver } from '@zkqes/sdk';
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { ProveAgeFlow } from '../../src/components/account/ProveAgeFlow';
import { useV5_4BindingsForWallet } from '../../src/hooks/useV5_4BindingsForWallet';

const mockedBuild = vi.mocked(buildAgeWitness);
const mockedBindings = vi.mocked(useV5_4BindingsForWallet);

// Default to "wallet owns exactly 1 binding" for the happy-path tests
// so the binding-pick step auto-advances. Tests that exercise N=0 /
// N>1 / loading / error branches override this in their setup.
const STUB_BINDING_ID = ('0x' + 'cd'.repeat(32)) as `0x${string}`;

/**
 * V5.4-shaped MockProver: emits exactly 3 publicSignals matching the
 * §1.3 FROZEN slot order (ageQualified / ageCutoffDate / nullifierCtx).
 * The bare `new MockProver()` default returns 14 publics for
 * `side: 'v5'`, which `packAgeProof`'s length-3 guard rejects.
 */
function v5_4MockProver(): MockProver {
  return new MockProver({
    result: {
      proof: {
        pi_a: ['1', '2', '1'],
        pi_b: [
          ['3', '4'],
          ['5', '6'],
          ['1', '0'],
        ],
        pi_c: ['7', '8', '1'],
      },
      publicSignals: ['1', '20070101', '1'],
    },
  });
}
function primeBindings(
  override: Partial<ReturnType<typeof useV5_4BindingsForWallet>> = {},
) {
  mockedBindings.mockReturnValue({
    data: [STUB_BINDING_ID],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...override,
  });
}

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

// Test pollution defense: every test starts with a fresh mockReturnValue
// for the bindings hook + a fresh useAccount-connected impl. Skipping
// `vi.restoreAllMocks()` (which was undoing the module-factory wagmi
// mock between tests, leaving useAccount returning undefined until
// re-impl'd in afterEach — race-prone with React's render scheduler).
// Default writeContract spy — tests can override per case via
// `vi.mocked(useWriteContract).mockReturnValue(...)`.
let writeContractSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedBuild.mockReset();
  mockedBindings.mockReset();
  vi.mocked(useAccount).mockImplementation(() => ({
    isConnected: true,
    address: ('0x' + 'a'.repeat(40)) as `0x${string}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any));
  vi.mocked(useChainId).mockImplementation(() => 84532);
  writeContractSpy = vi.fn();
  vi.mocked(useWriteContract).mockImplementation(() => ({
    writeContract: writeContractSpy,
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any));
  vi.mocked(useWaitForTransactionReceipt).mockImplementation(() => ({
    isSuccess: false,
    data: undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any));
});

afterEach(() => {
  cleanup();
});

describe('ProveAgeFlow — V5.4 civic-terminal v3 surface', () => {
  it('renders the v3 shell + Marquee + FooterRibbon + cutoff step at default state', async () => {
    primeBindings();
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    expect(screen.getByTestId('prove-age-v3-shell')).toBeInTheDocument();
    expect(screen.getByTestId('marquee')).toBeInTheDocument();
    expect(screen.getByTestId('footer-ribbon')).toBeInTheDocument();
    // Wallet auto-connect mock + N=1 binding auto-advance lands on cutoff.
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
  });

  it('renders the connect step when wallet is disconnected', () => {
    primeBindings();
    vi.mocked(useAccount).mockImplementation(() => ({
      isConnected: false,
      address: undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    expect(screen.getByTestId('prove-age-step-connect')).toBeInTheDocument();
    expect(screen.queryByTestId('prove-age-step-cutoff')).not.toBeInTheDocument();
  });

  it('cutoff input defaults to today − 18 years (YYYY-MM-DD)', async () => {
    primeBindings();
    // Fake ONLY Date — leave setTimeout/setInterval real so
    // `waitFor`'s polling still ticks through React's effect schedule.
    // Faking all timers (vi.useFakeTimers() default) freezes
    // `waitFor`'s retry interval and the cutoff step never appears
    // before the 5s test timeout.
    const fakeNow = new Date('2026-05-05T00:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fakeNow);
    try {
      render(<ProveAgeFlow prover={v5_4MockProver()} />);
      // Wait for the N=1 auto-advance to land on cutoff.
      await waitFor(() => {
        expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
      });
      const cutoff = screen.getByTestId('prove-age-cutoff-input') as HTMLInputElement;
      expect(cutoff.value).toBe('2008-05-05');
    } finally {
      vi.useRealTimers();
    }
  });

  // ── V5.4 binding-pick step — N=0 / N=1 / N>1 / loading / error ────

  it('binding-pick: shows loading state while resolver is in flight', () => {
    primeBindings({ data: [], isLoading: true });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    expect(
      screen.getByTestId('prove-age-step-binding-pick-loading'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('prove-age-step-cutoff')).not.toBeInTheDocument();
  });

  it('binding-pick: N=0 surfaces empty-state with home register-flow CTA', () => {
    primeBindings({ data: [] });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    expect(
      screen.getByTestId('prove-age-step-binding-pick-empty'),
    ).toBeInTheDocument();
    const cta = screen.getByTestId('prove-age-binding-pick-register-cta');
    // V5.4 nuke pass moved register Step1-4 inline on `/` (HomeDocument);
    // the legacy /ua/registerV5 route is gone.
    expect(cta).toHaveAttribute('href', '/');
  });

  it('binding-pick: N=1 auto-advances to cutoff (vast-majority path)', async () => {
    primeBindings({ data: [STUB_BINDING_ID] });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
  });

  it('binding-pick: N>1 renders explicit picker; click selects + advances', async () => {
    const second = ('0x' + 'ef'.repeat(32)) as `0x${string}`;
    primeBindings({ data: [STUB_BINDING_ID, second] });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    expect(
      screen.getByTestId('prove-age-step-binding-pick-multi'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId(`prove-age-binding-pick-option-${second}`),
    );
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
  });

  it('binding-pick: resolver error surfaces verbatim, blocks advancement', () => {
    primeBindings({ data: [], error: new Error('rpc-503') });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    const errBlock = screen.getByTestId('prove-age-step-binding-pick-error');
    expect(errBlock).toBeInTheDocument();
    expect(errBlock).toHaveTextContent('rpc-503');
    expect(screen.queryByTestId('prove-age-step-cutoff')).not.toBeInTheDocument();
  });

  it('drives cutoff → p7s → prove → result with ageQualified=1', async () => {
    primeBindings();
    mockedBuild.mockResolvedValue({
      witness: { ageCutoffDateIn: 20070101, nullifierCtxInput: '1', leafCertBytes: [], sdaFrameOffsetInTbs: 0 },
      publicSignals: { ageQualified: 1, ageCutoffDate: 20070101, nullifierCtx: '1' },
      dobYmd: 20060101,
    });
    const prover: IProver = v5_4MockProver();
    render(<ProveAgeFlow prover={prover} />);

    // Wait for N=1 auto-advance to cutoff, then continue cutoff → p7s.
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
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
    // Post-T5.4: result step idle substate renders the submit CTA when
    // ageQualified=1 + V5.4 deployment exists on the connected chain.
    // The pre-T5.4 `prove-age-submit-pending` placeholder assertion is
    // replaced — that testid now means "tx hash set, waiting for mining"
    // which only appears after the user clicks the CTA.
    expect(screen.getByTestId('prove-age-submit-cta')).toBeInTheDocument();
  });

  it('renders the not-qualified result when ageQualified=0', async () => {
    primeBindings();
    mockedBuild.mockResolvedValue({
      witness: { ageCutoffDateIn: 20070101, nullifierCtxInput: '1', leafCertBytes: [], sdaFrameOffsetInTbs: 0 },
      publicSignals: { ageQualified: 0, ageCutoffDate: 20070101, nullifierCtx: '1' },
      dobYmd: 20100101,
    });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);

    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
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
    primeBindings();
    mockedBuild.mockRejectedValue(new Error('diia-ua-extraction-failed'));
    render(<ProveAgeFlow prover={v5_4MockProver()} />);

    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
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

  it('blocks the prove button when no .p7s has been uploaded', async () => {
    primeBindings();
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('prove-age-cutoff-advance'));
    const proveBtn = screen.getByTestId('prove-age-prove') as HTMLButtonElement;
    expect(proveBtn.disabled).toBe(true);
  });

  // ── V5.4 T5.4 — proveAge writeContract submission ────────────────────

  /**
   * Helper to drive the flow end-to-end up to the result step with
   * ageQualified=1 + canned prover output. Each call runs the full
   * cutoff → p7s → prove pipeline; tests then exercise the submit
   * substate from there.
   */
  async function driveToResult(opts: { ageQualified?: 0 | 1 } = {}) {
    const ageQualified = opts.ageQualified ?? 1;
    primeBindings();
    mockedBuild.mockResolvedValue({
      witness: {
        ageCutoffDateIn: 20070101,
        nullifierCtxInput: '1',
        leafCertBytes: [],
        sdaFrameOffsetInTbs: 0,
      },
      publicSignals: { ageQualified, ageCutoffDate: 20070101, nullifierCtx: '1' },
      dobYmd: 20060101,
    });
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-cutoff')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('prove-age-cutoff-advance'));
    const file = new File([new Uint8Array([0x30])], 'fake.p7s');
    fireEvent.change(screen.getByTestId('prove-age-p7s-input'), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(
        (screen.getByTestId('prove-age-prove') as HTMLButtonElement).disabled,
      ).toBe(false);
    });
    fireEvent.click(screen.getByTestId('prove-age-prove'));
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-result')).toBeInTheDocument();
    });
  }

  it('submit substate: idle CTA renders when ageQualified=1', async () => {
    await driveToResult({ ageQualified: 1 });
    expect(screen.getByTestId('prove-age-submit-cta')).toBeInTheDocument();
  });

  it('submit substate: skip-not-qualified hint when ageQualified=0', async () => {
    await driveToResult({ ageQualified: 0 });
    expect(
      screen.getByTestId('prove-age-submit-skip-not-qualified'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('prove-age-submit-cta')).not.toBeInTheDocument();
  });

  it('submit substate: no-registry hint when on a chain without V5.4 deploy', async () => {
    vi.mocked(useChainId).mockImplementation(() => 1); // Ethereum mainnet — no V5.4
    await driveToResult({ ageQualified: 1 });
    expect(
      screen.getByTestId('prove-age-submit-no-registry'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('prove-age-submit-cta')).not.toBeInTheDocument();
  });

  it('submit CTA click fires writeContract with proveAge args', async () => {
    await driveToResult({ ageQualified: 1 });
    fireEvent.click(screen.getByTestId('prove-age-submit-cta'));
    expect(writeContractSpy).toHaveBeenCalledTimes(1);
    const call = writeContractSpy.mock.calls[0]![0];
    expect(call.functionName).toBe('proveAge');
    expect(call.address).toBe('0x262D017051196F8C686BFBa00Cbbe2BD5B055491');
    // args[0] = bindingId (the auto-selected N=1 STUB_BINDING_ID),
    // args[1] = ageCutoffDate (BigInt YYYYMMDD), args[2] = AgeProof tuple.
    expect(call.args[0]).toBe(STUB_BINDING_ID);
    expect(typeof call.args[1]).toBe('bigint');
    expect(call.args[2]).toHaveProperty('ageQualified');
    expect(call.args[2]).toHaveProperty('nullifierCtx');
  });

  it('submit substate: pending tag while txHash is set but receipt not yet mined', async () => {
    vi.mocked(useWriteContract).mockImplementation(() => ({
      writeContract: writeContractSpy,
      data: ('0x' + 'be'.repeat(32)) as `0x${string}`,
      isPending: false,
      error: null,
      reset: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
    await driveToResult({ ageQualified: 1 });
    expect(screen.getByTestId('prove-age-submit-pending')).toBeInTheDocument();
  });

  it('submit substate: success state when receipt is mined', async () => {
    vi.mocked(useWriteContract).mockImplementation(() => ({
      writeContract: writeContractSpy,
      data: ('0x' + 'ce'.repeat(32)) as `0x${string}`,
      isPending: false,
      error: null,
      reset: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
    vi.mocked(useWaitForTransactionReceipt).mockImplementation(() => ({
      isSuccess: true,
      data: { blockNumber: 42n, status: 'success' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
    await driveToResult({ ageQualified: 1 });
    expect(screen.getByTestId('prove-age-submit-success')).toBeInTheDocument();
  });

  it('submit error from writeContract drops to the error step with message', async () => {
    // Pre-render writeError set so the useEffect fires on mount and
    // pushes step → 'error' immediately. driveToResult's cutoff-await
    // would never see the cutoff step in this configuration; instead
    // render plainly + assert the error step appears.
    primeBindings();
    vi.mocked(useWriteContract).mockImplementation(() => ({
      writeContract: writeContractSpy,
      data: undefined,
      isPending: false,
      error: new Error('user rejected request'),
      reset: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));
    render(<ProveAgeFlow prover={v5_4MockProver()} />);
    await waitFor(() => {
      expect(screen.getByTestId('prove-age-step-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prove-age-step-error')).toHaveTextContent(
      'user rejected request',
    );
  });
});
