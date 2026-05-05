/* eslint-disable */
/**
 * V5.4 `ZKQESRegistryUA` registry ABI — minimal subset.
 *
 * Source-of-truth: `forge inspect ZKQESRegistryUA abi --json` against
 * contracts-eng's `feat/v5_4-contracts` worktree at `1a1da18` (the V5.4
 * UA Sepolia deploy commit). This file is **a hand-curated subset of
 * the full ABI**, scoped to what web-eng's V5.4 surfaces (ProveAgeFlow
 * + Phase-C T5 plumbing) consume:
 *
 *   - Functions: `proveAge` (writeContract), `getBinding` (read view),
 *     `bindings` (raw mapping read), `ageProvenCutoffs` (post-tx
 *     verification).
 *   - Events: `BindingRegistered`, `BindingRotated`, `BindingRevoke`
 *     (the resolver formula in `useV5_4BindingsForWallet` walks all
 *     three to compute the current N:1 wallet→binding mapping).
 *
 * The full ABI (admin transfer, policy/trusted-root rotation, register,
 * etc.) is intentionally NOT included — those flows have separate
 * surfaces (admin tools, RegisterC document) and shouldn't accidentally
 * leak into the prove-age UI's writeContract call sites.
 *
 * **Naming convention note (V5.4-era):** the contract is
 * `ZKQESRegistryUA` (Solidity); the SDK module name follows the
 * pre-#93 `Zkqes*`-cased convention to align with `ZkqesRegistryV5_2.ts`.
 * The sweeping `Zkqes* → ZKQES*` rename (#93) is a separate later arc.
 *
 * **Multi-binding cardinality (V5.4 schema change vs. V5.2):** the V5.2
 * `nullifierOf[wallet]` reverse mapping was dropped in V5.4 (rationale:
 * load-bearing rotation auth-sig + `bindings[bindingId].pk` match are
 * sufficient replay protection). Schema consequence: walletX MAY be
 * the bound wallet for multiple bindings (Alice + Bob both rotate to
 * walletX). This ABI is consumed by event-log enumeration, not direct
 * `wallet → binding` lookup.
 *
 * Refresh procedure when contracts-eng pumps a fuller ABI export:
 *   1. `cd /data/Develop/qkb-wt-v5/v5_4-contracts/packages/contracts`
 *   2. `node -e 'const j=require("./out/ZKQESRegistryUA.sol/ZKQESRegistryUA.json");
 *      const want=new Set(["BindingRegistered","BindingRotated",
 *      "BindingRevoke","proveAge","getBinding","ageProvenCutoffs",
 *      "bindings"]); console.log(JSON.stringify(j.abi.filter(e=>want.has(e.name)),null,2));'`
 *   3. Paste into the literal below; bump the source-pin commit.
 */

export const zkqesRegistryUaAbi = [
  {
    type: 'function',
    name: 'ageProvenCutoffs',
    inputs: [
      { name: '', type: 'bytes32', internalType: 'bytes32' },
      { name: '', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'bindings',
    inputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      { name: 'pk', type: 'address', internalType: 'address' },
      { name: 'ctxHash', type: 'uint256', internalType: 'uint256' },
      { name: 'policyLeafHash', type: 'uint256', internalType: 'uint256' },
      { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
      { name: 'dobCommit', type: 'uint256', internalType: 'uint256' },
      { name: 'dobSupported', type: 'uint8', internalType: 'uint8' },
      { name: 'revoked', type: 'bool', internalType: 'bool' },
      { name: 'nullifier', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBinding',
    inputs: [{ name: 'id', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IZKQESRegistry.Binding',
        components: [
          { name: 'pk', type: 'address', internalType: 'address' },
          { name: 'ctxHash', type: 'uint256', internalType: 'uint256' },
          { name: 'policyLeafHash', type: 'uint256', internalType: 'uint256' },
          { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
          { name: 'dobCommit', type: 'uint256', internalType: 'uint256' },
          { name: 'dobSupported', type: 'uint8', internalType: 'uint8' },
          { name: 'revoked', type: 'bool', internalType: 'bool' },
          { name: 'nullifier', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'proveAge',
    inputs: [
      { name: 'bindingId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'ageCutoffDate', type: 'uint256', internalType: 'uint256' },
      {
        name: 'proof',
        type: 'tuple',
        internalType: 'struct IZKQESRegistry.AgeProof',
        components: [
          { name: 'a', type: 'uint256[2]', internalType: 'uint256[2]' },
          { name: 'b', type: 'uint256[2][2]', internalType: 'uint256[2][2]' },
          { name: 'c', type: 'uint256[2]', internalType: 'uint256[2]' },
          { name: 'ageQualified', type: 'uint256', internalType: 'uint256' },
          { name: 'ageCutoffDate', type: 'uint256', internalType: 'uint256' },
          { name: 'nullifierCtx', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'BindingRegistered',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'pk', type: 'address', indexed: true, internalType: 'address' },
      { name: 'ctxHash', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BindingRevoke',
    inputs: [
      { name: 'bindingId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'revoked', type: 'bool', indexed: false, internalType: 'bool' },
      { name: 'rotatedBy', type: 'address', indexed: false, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'BindingRotated',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'oldPk', type: 'address', indexed: true, internalType: 'address' },
      { name: 'newPk', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
] as const;
