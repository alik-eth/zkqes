import type { Address } from 'viem';

// V4/V5/V5.1/V5.2 deployment surface deleted in the 2026-05-08 nuke
// pass. The V5.4 ZKQESRegistryUA is the only on-chain registry the SDK
// surfaces — see ZKQES_REGISTRY_UA + zkqesRegistryUaForChainId below.
// Pre-5.4 register/mint/rotate flows + their cert NFT deployments are
// gone; relying parties query bindings via the V5.4 registry's
// `bindings(bytes32)` view (mirrored in `getBinding`).
//
// Type re-export retained only for the (vanishingly few) external SDK
// consumers that import the `Address` alias from this module.
export type { Address };

// ===========================================================================
// V5.4 — per-country registry deployments (per-country pattern, A-narrow
// per orchestration §0). Currently UA-only on Base Sepolia; V5.5+ adds
// sibling per-country registries (DE, IT, FR, …) at distinct addresses
// under the shared `IZKQESRegistry` interface. Country-router skipped in
// V5.4 (single registry, one chain).
// ===========================================================================

/**
 * V5.4 ZKQESRegistryUA per-chain deployment metadata. Pumped from
 * `fixtures/contracts/base-sepolia.json` v5_4 section after each
 * registry redeploy (re-deploys are required after the post-Phase-B
 * verifier swap per spec §6 / orchestration §C — same posture as V5.2).
 *
 * Both `identityVerifier` + `ageVerifier` are immutable in the registry's
 * constructor; verifier swap = fresh registry redeploy + new pump.
 *
 * `deployBlock` anchors event-log enumeration via viem `getLogs`
 * `fromBlock` so the resolver in `useV5_4BindingsForWallet` doesn't scan
 * pre-deploy ranges.
 */
export interface ZkqesRegistryUaDeployment {
  readonly chainId: number;
  readonly address: Address;
  readonly identityVerifier: Address;
  readonly ageVerifier: Address;
  readonly verifierKind: 'stub' | 'real';
  readonly deployBlock: number;
  readonly deployedAt: string;
}

/**
 * V5.4 ZKQESRegistryUA addresses, keyed by network slug. Reads track
 * `fixtures/contracts/base-sepolia.json` v5_4 section byte-for-byte;
 * out-of-band updates land via lead-pumped commits.
 */
export const ZKQES_REGISTRY_UA = {
  baseSepolia: {
    chainId: 84532,
    // V5.4 UA registry, deployed 2026-05-05 at block 41115149.
    // Source: fixtures/contracts/base-sepolia.json v5_4.registry.
    address: '0x262D017051196F8C686BFBa00Cbbe2BD5B055491' as Address,
    // Both verifiers are immutable stubs pre-Phase-B-ceremony; swap
    // requires fresh registry redeploy + this constant repump.
    identityVerifier: '0xa669F0Ede4eBD025897554Af8aCcE31eA4990f04' as Address,
    ageVerifier: '0xc30DF40b1E2F8af15a36DBebc0E1BD91E1E2a693' as Address,
    verifierKind: 'stub',
    deployBlock: 41115149,
    deployedAt: '2026-05-05',
  },
} as const satisfies Record<string, ZkqesRegistryUaDeployment>;

export type ZkqesRegistryUaNetwork = keyof typeof ZKQES_REGISTRY_UA;

/**
 * Resolve the V5.4 UA registry deployment for a given chain id, or
 * `undefined` if no V5.4 deploy exists on that chain. Used by
 * `useV5_4BindingsForWallet` + the ProveAgeFlow submit path to gate
 * UI behavior on whether the user's connected chain has a registry to
 * write to.
 */
export function zkqesRegistryUaForChainId(
  id: number,
): ZkqesRegistryUaDeployment | undefined {
  for (const v of Object.values(ZKQES_REGISTRY_UA)) if (v.chainId === id) return v;
  return undefined;
}
