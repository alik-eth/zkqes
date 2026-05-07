import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile, type CompiledCircuit } from '../helpers/compile';

// V5.5 KeyCommitVar parity test — in-circuit hashing must match the TS
// reference (packages/sdk/src/witness/v5_5/key-commit.ts) and Solidity
// library (packages/contracts/src/libs/KeyCommit.sol) byte-for-byte.
//
// Loads the canonical parity fixture and witness-calcs the
// KeyCommitVar(600) test wrapper for every vector. The output signal
// `commit` MUST equal `expectedKeyCommit` from the fixture.
//
// MAX_BYTES=600 covers RSA-4096 SPKIs (~550B) with headroom; the test
// wrapper exercises the full sponge gate machinery (up to 5 rounds).

const MAX_BYTES = 600;

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../../fixtures/v5_5/key-commit-parity.json',
);

interface FixtureVector {
  label: string;
  describe: string;
  spkiHex: string;
  expectedChunkHash: string;
  expectedKeyCommit: string;
}

interface Fixture {
  notes: string;
  domainLiteral: string;
  domainConstant: string;
  vectors: FixtureVector[];
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out: number[] = new Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function paddedBytes(data: number[]): number[] {
  const out = new Array<number>(MAX_BYTES).fill(0);
  for (let i = 0; i < data.length; i++) out[i] = data[i]!;
  return out;
}

describe(`KeyCommitVar (MAX_BYTES=${MAX_BYTES})`, function () {
  // Compile is the long pole; allow up to 15 min.
  this.timeout(900_000);

  let circuit: CompiledCircuit;
  let fixture: Fixture;

  before(async () => {
    fixture = loadFixture();
    expect(fixture.domainLiteral).to.equal('zkqes-key-commit-v1');
    circuit = await compile('primitives/KeyCommitVarTest.circom');
  });

  it('matches TS reference for every parity vector', async () => {
    for (const v of fixture.vectors) {
      const data = hexToBytes(v.spkiHex);
      if (data.length > MAX_BYTES) {
        throw new Error(
          `vector "${v.label}" has length ${data.length} > MAX_BYTES ${MAX_BYTES}`,
        );
      }
      const w = await circuit.calculateWitness(
        { bytes: paddedBytes(data), len: data.length },
        true,
      );
      // calculateWitness returns the full witness array; the `commit`
      // output is at index 1 (index 0 is the constant 1).
      const got = w[1]!.toString();
      expect(got).to.equal(
        v.expectedKeyCommit,
        `KeyCommitVar drift on vector "${v.label}"`,
      );
    }
  });
});
