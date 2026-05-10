import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import type { Config } from 'wagmi';
import { http, fallback, type Chain } from 'viem';
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

// Per-chain RPC fallback list. The default Base Sepolia public RPC
// (`https://sepolia.base.org`) intermittently returns "no backend is
// currently healthy" under modest read load, which surfaces as a
// noisy `eth_getCode` failure on every page load (wagmi's
// `useReadContract` hooks fire one per binding). viem's `fallback`
// transport rotates to the next URL on connection failure and
// remembers the last-good one for the rest of the session.
//
// All entries are public + free; no API keys baked into the bundle.
// Override at deploy time via VITE_BASE_SEPOLIA_RPC_URL when a
// dedicated endpoint is available.
const baseSepoliaUrls: string[] = [
  ...(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL
    ? [import.meta.env.VITE_BASE_SEPOLIA_RPC_URL as string]
    : []),
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.gateway.tenderly.co',
  'https://sepolia.base.org',
];
const baseUrls: string[] = [
  ...(import.meta.env.VITE_BASE_RPC_URL
    ? [import.meta.env.VITE_BASE_RPC_URL as string]
    : []),
  'https://base-rpc.publicnode.com',
  'https://base.gateway.tenderly.co',
  'https://mainnet.base.org',
];
const sepoliaUrls: string[] = [
  ...(import.meta.env.VITE_SEPOLIA_RPC_URL
    ? [import.meta.env.VITE_SEPOLIA_RPC_URL as string]
    : []),
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
];

export const wagmiConfig: Config = getDefaultConfig({
  appName: 'zkqes',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
  chains: CHAIN_LIST,
  transports: {
    [baseSepolia.id]: fallback(baseSepoliaUrls.map((u) => http(u))),
    [base.id]: fallback(baseUrls.map((u) => http(u))),
    [sepolia.id]: fallback(sepoliaUrls.map((u) => http(u))),
  },
  ssr: false,
});

export const ACTIVE_CHAIN: Chain = ACTIVE;
