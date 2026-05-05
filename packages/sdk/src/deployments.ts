import type { Address } from 'viem';

export interface ZkqesDeployment {
  chainId: number;
  registry: Address;
  /**
   * V5 registry address (single-proof Groth16 architecture).
   * Distinct deployment slot from V4 — see V5 architecture spec §0.
   * Zero-address until lead's §9.4 Base Sepolia E2E deploy.
   */
  registryV5: Address;
  zkqesCertificate: Address;
  verifiers: {
    leaf: Address;
    chain: Address;
    age: Address;
    /** V5 verifier (Groth16VerifierV5) — zero until ceremony close. */
    v5: Address;
  };
  mintDeadline: number; // unix seconds
}

export const ZKQES_DEPLOYMENTS = {
  sepolia: {
    chainId: 11155111,
    // populated by `node scripts/sync-deployments.mjs` from
    // fixtures/contracts/sepolia.json (UA-scoped section).
    registry:           '0xd33B73EB9c78d7AcE7AB84adAF4c518573Ce47a6' as Address,
    registryV5:         '0x0000000000000000000000000000000000000000' as Address,  // pumped post-§9.4 Base Sepolia deploy
    zkqesCertificate:  '0x30E13c76D0BB02Ab4a65048B6546ABC3ADDabA48' as Address,
    verifiers: {
      leaf:  '0xF407AFCEE7b5eE2AE2ef52041DFC224Fed010Cc3' as Address,
      chain: '0xc1a0fd1e620398b019ff3941b6c601afe81b33b8' as Address,
      age:   '0x7ac13661E4B8a5AC44D116f5df11CA84eE81D09a' as Address,
      v5:    '0x0000000000000000000000000000000000000000' as Address,  // pumped post-ceremony + Sepolia deploy
    },
    mintDeadline: 1792833194,
  },
  // Base Sepolia (L2 testnet) — current pre-launch deploy target per
  // task #15 / #70. v5.2 stub-verifier deployment populated from
  // fixtures/contracts/base-sepolia.json (deployed 2026-05-04). V4
  // contracts not present on this chain — V4 was Sepolia-L1-only.
  // The verifierKind is 'stub' until the post-ceremony Groth16Verifier
  // swap (which per spec §8.2 requires a fresh registry redeploy).
  baseSepolia: {
    chainId: 84532,
    registry:           '0x0000000000000000000000000000000000000000' as Address,
    registryV5:         '0xeE3bE208418DB51040e5983138C758C9eD154816' as Address,
    zkqesCertificate:  '0x1e6a264F760D80BBf9E6fb2700A69b93B46a1A63' as Address,
    verifiers: {
      leaf:  '0x0000000000000000000000000000000000000000' as Address,
      chain: '0x0000000000000000000000000000000000000000' as Address,
      age:   '0x0000000000000000000000000000000000000000' as Address,
      v5:    '0x5d63671653d9a047493386D494891fFDEc64007e' as Address,
    },
    mintDeadline: 0,
  },
  base: {
    chainId: 8453,
    // populated by M8 deploy (post-§9.4 mainnet launch)
    registry:           '0x0000000000000000000000000000000000000000' as Address,
    registryV5:         '0x0000000000000000000000000000000000000000' as Address,
    zkqesCertificate:  '0x0000000000000000000000000000000000000000' as Address,
    verifiers: {
      leaf:  '0x0000000000000000000000000000000000000000' as Address,
      chain: '0x0000000000000000000000000000000000000000' as Address,
      age:   '0x0000000000000000000000000000000000000000' as Address,
      v5:    '0x0000000000000000000000000000000000000000' as Address,
    },
    mintDeadline: 0,
  },
} as const satisfies Record<string, ZkqesDeployment>;

export type ZkqesNetwork = keyof typeof ZKQES_DEPLOYMENTS;

export function deploymentForChainId(id: number): ZkqesDeployment | undefined {
  for (const v of Object.values(ZKQES_DEPLOYMENTS)) if (v.chainId === id) return v;
  return undefined;
}

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
