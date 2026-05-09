import { describe, expect, it } from 'vitest';
import {
  ZKQES_REGISTRY_UA,
  zkqesRegistryUaForChainId,
} from './deployments.js';
import { zkqesRegistryUaAbi } from './abi/ZkqesRegistryUA.js';

describe('ZKQES_REGISTRY_UA — V7 per-country deployment metadata', () => {
  it('exposes the Base Sepolia deploy at the documented address', () => {
    // Source-of-truth pin: fixtures/contracts/base-sepolia.json v7.registry.
    expect(ZKQES_REGISTRY_UA.baseSepolia.address).toBe(
      '0xf0Ef8b29231B985B5A9bED9acDbdC39aA628A6Ce',
    );
    expect(ZKQES_REGISTRY_UA.baseSepolia.chainId).toBe(84532);
    expect(ZKQES_REGISTRY_UA.baseSepolia.deployBlock).toBe(41295180);
  });

  it('exposes the immutable verifier addresses (real identity, stub age)', () => {
    expect(ZKQES_REGISTRY_UA.baseSepolia.identityVerifier).toBe(
      '0x552541362cf433e27Af70eA9328f637386EcC3F3',
    );
    expect(ZKQES_REGISTRY_UA.baseSepolia.ageVerifier).toBe(
      '0x2d3B2F9A339AFab6033291CE6cEB8D1c59A27633',
    );
    expect(ZKQES_REGISTRY_UA.baseSepolia.verifierKind).toBe('real');
  });

  it('zkqesRegistryUaForChainId resolves Base Sepolia (84532)', () => {
    const dep = zkqesRegistryUaForChainId(84532);
    expect(dep).toBeDefined();
    expect(dep!.address).toBe(ZKQES_REGISTRY_UA.baseSepolia.address);
  });

  it('zkqesRegistryUaForChainId returns undefined for chains without a V5.4 deploy', () => {
    expect(zkqesRegistryUaForChainId(1)).toBeUndefined(); // Ethereum mainnet
    expect(zkqesRegistryUaForChainId(8453)).toBeUndefined(); // Base mainnet
    expect(zkqesRegistryUaForChainId(11155111)).toBeUndefined(); // Sepolia L1
  });
});

describe('zkqesRegistryUaAbi — V5.4 minimal ABI subset', () => {
  it('exports BindingRegistered with indexed wallet (pk) topic for log filtering', () => {
    const ev = zkqesRegistryUaAbi.find(
      (e) => e.type === 'event' && e.name === 'BindingRegistered',
    );
    expect(ev).toBeDefined();
    const pkInput = ev!.inputs.find((i) => i.name === 'pk');
    expect(pkInput?.indexed).toBe(true);
    expect(pkInput?.type).toBe('address');
  });

  it('exports BindingRebound with both oldPk + newPk indexed (V5.6 unified-register)', () => {
    const ev = zkqesRegistryUaAbi.find(
      (e) => e.type === 'event' && e.name === 'BindingRebound',
    );
    expect(ev).toBeDefined();
    const oldPk = ev!.inputs.find((i: { name: string }) => i.name === 'oldPk');
    const newPk = ev!.inputs.find((i: { name: string }) => i.name === 'newPk');
    expect(oldPk?.indexed).toBe(true);
    expect(newPk?.indexed).toBe(true);
  });

  it('exports BindingRevoke with indexed bindingId for status follow-ups', () => {
    const ev = zkqesRegistryUaAbi.find(
      (e) => e.type === 'event' && e.name === 'BindingRevoke',
    );
    expect(ev).toBeDefined();
    const id = ev!.inputs.find((i) => i.name === 'bindingId');
    expect(id?.indexed).toBe(true);
  });

  it('exports proveAge with the §1.3 FROZEN AgeProof tuple shape', () => {
    const fn = zkqesRegistryUaAbi.find(
      (e) => e.type === 'function' && e.name === 'proveAge',
    );
    expect(fn).toBeDefined();
    expect(fn!.inputs).toHaveLength(3);
    const proof = fn!.inputs[2]!;
    expect(proof.name).toBe('proof');
    expect(proof.type).toBe('tuple');
    // The §1.3 FROZEN slot order — ageQualified / ageCutoffDate /
    // nullifierCtx — appears at the END of the AgeProof tuple
    // components after a/b/c. Drift here breaks proveAge silently
    // against the on-chain verifier.
    const components = (proof as { components: readonly { name: string; type: string }[] })
      .components;
    expect(components.map((c) => c.name)).toEqual([
      'a',
      'b',
      'c',
      'ageQualified',
      'ageCutoffDate',
      'nullifierCtx',
    ]);
  });

  it('exports getBinding view returning the IZKQESRegistry.Binding tuple shape', () => {
    const fn = zkqesRegistryUaAbi.find(
      (e) => e.type === 'function' && e.name === 'getBinding',
    );
    expect(fn).toBeDefined();
    expect(fn!.outputs).toHaveLength(1);
    const tup = fn!.outputs[0]!;
    expect(tup.type).toBe('tuple');
    const components = (tup as { components: readonly { name: string }[] }).components;
    expect(components.map((c) => c.name)).toEqual([
      'pk',
      'ctxHash',
      'policyLeafHash',
      'timestamp',
      'dobCommit',
      'dobSupported',
      'revoked',
      'nullifier',
    ]);
  });
});
