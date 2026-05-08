// V5.5 signal-input contract lock.
//
// Parses ZkqesPresentationV5_5.circom for `signal input` declarations
// and asserts the set matches the canonical V5.5 contract documented
// in spec §6 + §7.2. Pairs with the web-side
// `build-witness-v5_5.test.ts` shape assertion: if both pass, the
// builder JSON keys are byte-equal to the circuit's signal-input
// declarations, so a "Signal X not found" / "Too many values" failure
// at witness-calc time is impossible.
//
// Why static-analysis instead of full circom_tester round-trip:
// the V5.5 main circuit has 5,604,985 non-linear constraints
// (spec §13.4). A circom_tester `compile()` call on this would burn
// ~10 minutes per fresh hash and risk OOM on the wasm witness path.
// Static parsing catches the highest-likelihood regression class
// (signal rename / add / drop without builder update) at <1 ms cost.
//
// Spec refs:
//   §6   21-signal public layout
//   §7.2 private-input deltas vs V5.4 (drop P-256 limbs, add SPKI slice)

import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CIRCUIT_PATH = resolve(
  HERE,
  '..',
  'circuits',
  'ZkqesPresentationV5_5.circom',
);

// Canonical V5.5 signal-input contract. ORDER doesn't matter (set
// comparison); names are the load-bearing surface. Public signals
// listed first (slots [0..20] per §6); private signals follow.
const EXPECTED_PUBLIC_INPUTS = [
  // [0..10]
  'timestamp',
  'nullifier',
  'ctxHashHi', 'ctxHashLo',
  'bindingHashHi', 'bindingHashLo',
  'signedAttrsHashHi', 'signedAttrsHashLo',
  'leafTbsHashHi', 'leafTbsHashLo',
  'policyLeafHash',
  // [11] V5.5 NEW (replaces V5.4 leafSpkiCommit; intSpkiCommit dropped)
  'leafKeyCommit',
  // [12..20]
  'identityFingerprint',
  'identityCommitment',
  'rotationMode',
  'rotationOldCommitment',
  'rotationNewWallet',
  'bindingPkXHi', 'bindingPkXLo',
  'bindingPkYHi', 'bindingPkYLo',
] as const;

const EXPECTED_PRIVATE_INPUTS = [
  // Binding canonical bytes + SHA padding.
  'bindingBytes', 'bindingLength',
  'bindingPaddedIn', 'bindingPaddedLen',
  // BindingFieldOffsets (BindingV2Parser surface).
  'pkValueOffset', 'schemeValueOffset',
  'assertionsValueOffset', 'statementSchemaValueOffset',
  'nonceValueOffset', 'ctxValueOffset', 'ctxHexLen',
  'policyIdValueOffset', 'policyIdLen',
  'policyLeafHashValueOffset', 'policyBindingSchemaValueOffset',
  'policyVersionValueOffset', 'policyVersionDigitCount',
  'tsValueOffset', 'tsDigitCount',
  'versionValueOffset',
  'nonceBytesIn', 'policyIdBytesIn', 'policyVersionIn',
  // SignedAttrs.
  'signedAttrsBytes', 'signedAttrsLength',
  'signedAttrsPaddedIn', 'signedAttrsPaddedLen',
  'mdAttrOffset',
  // Leaf TBS.
  'leafTbsBytes', 'leafTbsLength',
  'leafTbsPaddedIn', 'leafTbsPaddedLen',
  // Ctx canonical-hex padded for SHA.
  'ctxPaddedIn', 'ctxPaddedLen',
  // Leaf cert + identity-extraction offsets.
  'leafCertBytes',
  'subjectSerialValueOffset', 'subjectSerialValueLength',
  'subjectSerialValueOffsetInTbs',
  'subjectSerialOidOffsetInTbs',
  // V5.5 SPKI slice (replaces V5.4 P-256 limb arrays).
  'leafSpkiBytes', 'leafSpkiLength', 'leafSpkiOffsetInTbs',
  // Wallet secrets.
  'walletSecret', 'oldWalletSecret',
] as const;

// V5.4 fields explicitly REMOVED in V5.5; presence of any in the
// circuit indicates an incomplete refactor.
const FORBIDDEN_INPUTS = [
  'leafXLimbs', 'leafYLimbs',
  'intXLimbs', 'intYLimbs',
  'leafSpkiCommit', 'intSpkiCommit',
] as const;

function parseSignalInputs(src: string): Set<string> {
  // Strip comments first to avoid matching commented-out signal lines.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const re = /\bsignal\s+input\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const out = new Set<string>();
  for (const m of stripped.matchAll(re)) out.add(m[1]!);
  return out;
}

describe('V5.5 signal-input contract', () => {
  const src = readFileSync(CIRCUIT_PATH, 'utf8');
  const declared = parseSignalInputs(src);
  const expected = new Set<string>([
    ...EXPECTED_PUBLIC_INPUTS,
    ...EXPECTED_PRIVATE_INPUTS,
  ]);

  it('declares every expected V5.5 signal input', () => {
    const missing = [...expected].filter((n) => !declared.has(n));
    expect(missing, `missing inputs: ${missing.join(', ')}`).to.deep.equal([]);
  });

  it('declares no unexpected signal inputs', () => {
    const extra = [...declared].filter((n) => !expected.has(n));
    expect(extra, `unexpected inputs: ${extra.join(', ')}`).to.deep.equal([]);
  });

  it('does not declare any V5.4-era forbidden inputs', () => {
    const leaked = FORBIDDEN_INPUTS.filter((n) => declared.has(n));
    expect(
      leaked,
      `V5.4 fields still present (must be removed in V5.5): ${leaked.join(', ')}`,
    ).to.deep.equal([]);
  });

  it('declares 21 public signals (frozen per spec §6)', () => {
    // Public signals are those passed to the main component constructor
    // via `component main {public [...]} = ZkqesPresentationV5_5();`.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const m = stripped.match(/component\s+main\s*\{\s*public\s*\[([^\]]+)\]/);
    expect(m, 'main component public signal list not found').to.not.equal(null);
    const list = m![1]!.split(',').map((s) => s.trim()).filter(Boolean);
    expect(list).to.have.lengthOf(21);
    expect(new Set(list)).to.deep.equal(new Set(EXPECTED_PUBLIC_INPUTS));
  });
});
