import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import type { Config } from 'wagmi';
import type { Chain } from 'viem';
import { base, baseSepolia, sepolia } from 'wagmi/chains';

// VITE_CHAIN selects the active chain at build time. Pre-launch
// posture (tasks #15 / #70): contracts deploy to Base Sepolia (L2),
// so 'base-sepolia' is the canonical pre-§9.4 value. 'sepolia'
// (L1 Ethereum testnet) stayed in here for legacy reasons; keep it
// supported but no longer the default for new deploys.
const RAW_CHAIN = (import.meta.env.VITE_CHAIN as string | undefined) ?? '';

const ACTIVE_CHAIN_BY_KEY: Record<string, Chain> = {
  base: base,
  'base-sepolia': baseSepolia,
  sepolia: sepolia,
};

// Default to Base mainnet if the env var is unset or unrecognized —
// safest fail-closed for production builds. Pre-launch deploys must
// pass VITE_CHAIN=base-sepolia explicitly.
const ACTIVE: Chain = ACTIVE_CHAIN_BY_KEY[RAW_CHAIN] ?? base;

// Wallet picker shows mainnet + the active testnet (or both testnets
// if mainnet IS the active chain). Order matters — RainbowKit
// highlights the FIRST chain as the recommended switch target.
const CHAIN_LIST: readonly [Chain, ...Chain[]] =
  ACTIVE.id === base.id
    ? [base, baseSepolia, sepolia]
    : ACTIVE.id === baseSepolia.id
      ? [baseSepolia, base]
      : [sepolia, base];

export const wagmiConfig: Config = getDefaultConfig({
  appName: 'zkqes',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: CHAIN_LIST,
  ssr: false,
});

export const ACTIVE_CHAIN: Chain = ACTIVE;
