// V5.4 — wallet → bindingId[] resolver hook.
//
// Spec ref: docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md §3.
// Plan ref: docs/superpowers/plans/2026-05-05-zkqes-v5_4-web.md T5.
// Cardinality cross-broadcast: V5.4 dropped V5.1's `nullifierOf[wallet]`
// reverse mapping — walletX MAY be the bound wallet for multiple bindings
// (Alice + Bob both rotate to walletX). 99% of users have N=1; UI must
// not assume it.
//
// Resolution formula (lead-broadcast):
//
//   bindings(wallet) = (BindingRegistered.pk == wallet)
//                    ∪ (BindingRotated.newPk == wallet)
//                    ∖ (BindingRotated.oldPk == wallet)
//
// All three event topics are indexed (verified in T5.1 commit
// `eff9fbd`'s ABI tests); the resolver runs as three parallel
// `getLogs` calls with the wallet as a topic filter — no on-chain RPC
// scan over the full log range, no contracts-eng redeploy needed.
//
// Revoked bindings are NOT filtered here (BindingRevoke event exists
// but folding latest-state-per-bindingId would double the RPC cost
// for a Phase A skeleton). The picker UI surfaces a `revoked: true`
// hint via per-binding `getBinding(id)` reads when N > 1; for N == 1
// the prove-age writeContract will surface the contract revert with
// a pointed error message.

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import {
  zkqesRegistryUaForChainId,
  zkqesRegistryUaAbi,
} from '@zkqes/sdk';

/**
 * Result shape mirrors wagmi's `useReadContract` so callers can use
 * the familiar `{ data, isLoading, error, refetch }` pattern.
 */
export interface UseV5_4BindingsForWalletReturn {
  /** Currently-active binding IDs owned by `wallet` on the connected
   *  chain. Empty array when no V5.4 deployment exists on this chain
   *  or the wallet has zero bindings. */
  readonly data: readonly `0x${string}`[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}

const ABI_BINDING_REGISTERED = zkqesRegistryUaAbi.find(
  (e) => e.type === 'event' && e.name === 'BindingRegistered',
);
const ABI_BINDING_ROTATED = zkqesRegistryUaAbi.find(
  (e) => e.type === 'event' && e.name === 'BindingRotated',
);

if (!ABI_BINDING_REGISTERED || !ABI_BINDING_ROTATED) {
  // Defensive — would only trigger on a regression in the ABI subset
  // file (`packages/sdk/src/abi/ZkqesRegistryUA.ts`); the unit tests
  // there pin both events' presence + indexed flags.
  throw new Error(
    'useV5_4BindingsForWallet: zkqesRegistryUaAbi missing BindingRegistered or BindingRotated — ABI subset is broken',
  );
}

/**
 * Resolve the set of currently-active V5.4 binding IDs owned by
 * `wallet` on the chain the connected public client is pointed at.
 *
 * Returns the empty array when `wallet` is undefined OR the public
 * client's chain has no V5.4 deployment registered (per
 * `zkqesRegistryUaForChainId`). The query is keyed on chainId +
 * wallet so cross-chain switches re-fetch cleanly.
 */
export function useV5_4BindingsForWallet(
  wallet: `0x${string}` | undefined,
): UseV5_4BindingsForWalletReturn {
  const publicClient = usePublicClient();
  const chainId = publicClient?.chain?.id;
  const deployment =
    chainId !== undefined ? zkqesRegistryUaForChainId(chainId) : undefined;

  const query = useQuery<readonly `0x${string}`[]>({
    queryKey: ['v5_4-bindings-for-wallet', chainId, wallet] as const,
    enabled: Boolean(publicClient && wallet && deployment),
    queryFn: async () => {
      // Narrowed by `enabled` above, but the assertion is needed for
      // TS since `enabled` doesn't refine via the queryKey type.
      if (!publicClient || !wallet || !deployment) return [];

      const fromBlock = BigInt(deployment.deployBlock);
      const address = deployment.address;

      // Public Base Sepolia RPC (sepolia.base.org) caps eth_getLogs at
      // a ~10k-block range AND a per-response payload size; an unbounded
      // [deployBlock..latest] sweep returns HTTP 413 once the chain has
      // grown >~1M blocks past deploy. Chunk into 9999-block windows.
      // Same pattern as routes/verifyBinding.tsx.
      const LOG_CHUNK = 9999n;
      const latestBlock = await publicClient.getBlockNumber();

      async function getLogsChunked(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventAbi: any,
        args: Record<string, `0x${string}`>,
      ): Promise<readonly unknown[]> {
        const out: unknown[] = [];
        let from = fromBlock;
        while (from <= latestBlock) {
          const to = from + LOG_CHUNK > latestBlock ? latestBlock : from + LOG_CHUNK;
          const logs = await publicClient!.getLogs({
            address,
            event: eventAbi,
            args,
            fromBlock: from,
            toBlock: to,
          });
          out.push(...logs);
          from = to + 1n;
        }
        return out;
      }

      // Three parallel chunked fans. viem encodes the wallet arg as
      // a topic filter when the corresponding param is `indexed: true`
      // (verified in T5.1's ABI subset tests).
      const [registeredLogs, rotatedInLogs, rotatedOutLogs] = await Promise.all([
        getLogsChunked(ABI_BINDING_REGISTERED, { pk: wallet }),
        getLogsChunked(ABI_BINDING_ROTATED, { newPk: wallet }),
        getLogsChunked(ABI_BINDING_ROTATED, { oldPk: wallet }),
      ]);

      // Set semantics: union (registered + rotated-in) minus rotated-out.
      // viem's Log type when event is `any` doesn't surface `.args` on the
      // narrow type — cast each log to the indexed-decoded shape we know
      // it has at runtime (the ABI subset's BindingRegistered + BindingRotated
      // both put `bytes32 indexed id` in slot 0 → topic1 → args.id).
      const idOf = (l: unknown): `0x${string}` | undefined =>
        (l as { args?: { id?: `0x${string}` } }).args?.id;
      const owned = new Set<`0x${string}`>();
      for (const l of registeredLogs) {
        const id = idOf(l);
        if (id) owned.add(id);
      }
      for (const l of rotatedInLogs) {
        const id = idOf(l);
        if (id) owned.add(id);
      }
      for (const l of rotatedOutLogs) {
        const id = idOf(l);
        if (id) owned.delete(id);
      }

      // Stable iteration order for UI rendering — sort the bytes32
      // hex lex; bindingIds are deterministically derived from the
      // identityCommitment so this is deterministic across reloads.
      return [...owned].sort();
    },
    // Bindings rarely change; a 30s stale time avoids spamming the
    // RPC on remounts during the cutoff/p7s/prove flow. Manual
    // refetch available via the returned `refetch` function.
    staleTime: 30_000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
