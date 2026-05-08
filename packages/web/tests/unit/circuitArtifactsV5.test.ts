import { describe, expect, it, vi } from 'vitest';

// Local-dev `.env.local` typically points VITE_V5_*_URL/SHA at the
// `public/local-zkey/` symlinks so the in-browser prover works. The
// placeholder-sentinel assertions below need the unconfigured shape,
// so stub the env vars + reset the module cache before importing.
const STUBBED = ['VITE_V5_WASM_URL', 'VITE_V5_ZKEY_URL', 'VITE_V5_WASM_SHA256', 'VITE_V5_ZKEY_SHA256'] as const;
for (const k of STUBBED) vi.stubEnv(k, '');
vi.resetModules();

const {
  V5_PROVER_ARTIFACTS,
  assertV5ArtifactsConfigured,
  isV5ArtifactsConfigured,
} = await import('../../src/lib/circuitArtifacts');

describe('V5_PROVER_ARTIFACTS', () => {
  it('exposes the V5 single-circuit envelope (qkb/2.0, ~3M constraints)', () => {
    expect(V5_PROVER_ARTIFACTS.schemaVersion).toBe('zkqes/2.0');
    expect(V5_PROVER_ARTIFACTS.expectedConstraintCount).toBe(3_000_000);
    expect(V5_PROVER_ARTIFACTS.expectedZkeyBytes).toBe(1_500_000_000);
  });

  it('ships placeholder URLs + sha256s pre-ceremony', () => {
    // Until lead pumps real ceremony artifacts the URLs MUST be sentinels.
    // If a future commit lands real URLs by mistake before §9.6 closes,
    // this test is the brake.
    expect(V5_PROVER_ARTIFACTS.wasmUrl).toMatch(/^__V5_PROVER_/);
    expect(V5_PROVER_ARTIFACTS.zkeyUrl).toMatch(/^__V5_PROVER_/);
    expect(V5_PROVER_ARTIFACTS.wasmSha256).toMatch(/^__V5_PROVER_/);
    expect(V5_PROVER_ARTIFACTS.zkeySha256).toMatch(/^__V5_PROVER_/);
  });
});

describe('assertV5ArtifactsConfigured', () => {
  it('throws with a ceremony-pump pointer when artifacts unconfigured', () => {
    expect(() => assertV5ArtifactsConfigured()).toThrow(
      /not yet configured.*Phase 2 ceremony pump/i,
    );
  });
});

describe('isV5ArtifactsConfigured', () => {
  it('returns false when artifacts unconfigured (UI-gating predicate)', () => {
    expect(isV5ArtifactsConfigured()).toBe(false);
  });
});
