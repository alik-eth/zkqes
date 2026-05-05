// Smoke-test for publish-status's per-circuit update logic (V5.4 plan T5).
//
// Follows the existing `_smoke-r2.ts` convention (prefix-underscore =
// runnable smoke test, no test-framework dep). Run via:
//
//   pnpm tsx scripts/_test-publish-status.ts
//
// Exits 0 on green, non-zero with a stderr line on failure. No vitest
// or mocha — keeps ceremony-coord's dep set minimal.
//
// Coverage:
//   1. applyCircuitUpdate adds a fresh entry under circuits[name] when
//      no prior entry exists.
//   2. applyCircuitUpdate isolates one circuit from another — updates to
//      v5.3-identity don't touch v5.4-age-diia-ua's entry, and
//      vice-versa.
//   3. applyCircuitUpdate enforces per-circuit round monotonicity
//      (round must be prev+1, or 1 if no prior).
//   4. validateStatusPayload accepts payloads with and without the
//      circuits field (back-compat with v2 payloads).
//   5. validateStatusPayload rejects malformed circuits entries.
//
// What's NOT covered here (out of T5 scope):
//   - Live R2 round-trip — that's `_smoke-r2.ts`.
//   - Pending-file disk I/O for `applyCircuitRoundFromPending` —
//     wrapping mock-fs adds a dep; the I/O bridge is shared with the
//     legacy `applyRoundUpdate` and is exercised by the lead's manual
//     ceremony runs.

import {
  applyCircuitUpdate,
  validateStatusPayload,
  type CeremonyStatusPayload,
} from '../src/types.ts';

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: TestCase[] = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertThrows(fn: () => void, expectedSubstring: string): void {
  let threw = false;
  let msg = '';
  try {
    fn();
  } catch (e) {
    threw = true;
    msg = (e as Error).message;
  }
  if (!threw) {
    throw new Error(`expected throw containing "${expectedSubstring}", but no throw`);
  }
  if (!msg.includes(expectedSubstring)) {
    throw new Error(`expected throw containing "${expectedSubstring}", got: ${msg}`);
  }
}

const baseline: CeremonyStatusPayload = {
  round: 1,
  totalRounds: 5,
  contributors: [],
  finalZkeySha256: null,
  beaconBlockHeight: null,
  beaconHash: null,
  phase: 'recruiting',
};

test('applyCircuitUpdate adds fresh entry under circuits[v5.3-identity]', () => {
  const next = applyCircuitUpdate(
    baseline,
    'v5.3-identity',
    1,
    'alice',
    '2026-05-05T18:00:00Z',
  );
  assert(next.circuits, 'circuits map should be present');
  const entry = next.circuits['v5.3-identity'];
  assert(entry, "circuits['v5.3-identity'] should exist");
  assertEqual(entry.round, 1, 'round');
  assertEqual(entry.lastContributor, 'alice', 'lastContributor');
  assertEqual(entry.lastContributedAt, '2026-05-05T18:00:00Z', 'lastContributedAt');
  // Top-level round/contributors must NOT be touched by per-circuit update.
  assertEqual(next.round, baseline.round, 'top-level round unchanged');
  assertEqual(next.contributors.length, 0, 'top-level contributors untouched');
});

test('applyCircuitUpdate isolates updates between circuits', () => {
  // Sequential updates: first v5.3-identity, then v5.4-age-diia-ua.
  // After both, both entries exist with their own round counters.
  const after1 = applyCircuitUpdate(
    baseline,
    'v5.3-identity',
    1,
    'alice',
    '2026-05-05T18:00:00Z',
  );
  const after2 = applyCircuitUpdate(
    after1,
    'v5.4-age-diia-ua',
    1,
    'bob',
    '2026-05-05T18:01:00Z',
  );
  assert(after2.circuits, 'circuits map present after both');
  assertEqual(after2.circuits['v5.3-identity']?.round, 1, 'v5.3 round');
  assertEqual(after2.circuits['v5.3-identity']?.lastContributor, 'alice', 'v5.3 contributor');
  assertEqual(after2.circuits['v5.4-age-diia-ua']?.round, 1, 'v5.4 round');
  assertEqual(after2.circuits['v5.4-age-diia-ua']?.lastContributor, 'bob', 'v5.4 contributor');

  // Now advance v5.3 only. v5.4 entry must stay byte-identical.
  const after3 = applyCircuitUpdate(
    after2,
    'v5.3-identity',
    2,
    'carol',
    '2026-05-05T18:02:00Z',
  );
  assertEqual(after3.circuits!['v5.3-identity']?.round, 2, 'v5.3 advanced to round 2');
  assertEqual(
    after3.circuits!['v5.3-identity']?.lastContributor,
    'carol',
    'v5.3 contributor advanced',
  );
  // ISOLATION: v5.4 untouched.
  assertEqual(
    after3.circuits!['v5.4-age-diia-ua']?.round,
    1,
    'v5.4 round NOT advanced (isolation)',
  );
  assertEqual(
    after3.circuits!['v5.4-age-diia-ua']?.lastContributor,
    'bob',
    'v5.4 contributor NOT changed (isolation)',
  );
  assertEqual(
    after3.circuits!['v5.4-age-diia-ua']?.lastContributedAt,
    '2026-05-05T18:01:00Z',
    'v5.4 timestamp NOT changed (isolation)',
  );
});

test('applyCircuitUpdate enforces per-circuit round monotonicity', () => {
  // First update: round must be 1 (no prior entry).
  assertThrows(
    () =>
      applyCircuitUpdate(baseline, 'v5.3-identity', 2, 'alice', '2026-05-05T18:00:00Z'),
    'expected round 1',
  );
  // After round 1 lands, round 2 OK; round 3 (skip) must throw.
  const after1 = applyCircuitUpdate(
    baseline,
    'v5.3-identity',
    1,
    'alice',
    '2026-05-05T18:00:00Z',
  );
  assertThrows(
    () =>
      applyCircuitUpdate(after1, 'v5.3-identity', 3, 'bob', '2026-05-05T18:01:00Z'),
    'expected round 2',
  );
  // Re-applying same round (1 again) also throws.
  assertThrows(
    () =>
      applyCircuitUpdate(after1, 'v5.3-identity', 1, 'bob', '2026-05-05T18:01:00Z'),
    'expected round 2',
  );
});

test('applyCircuitUpdate rejects non-integer round', () => {
  assertThrows(
    () =>
      applyCircuitUpdate(baseline, 'v5.3-identity', 0, 'alice', '2026-05-05T18:00:00Z'),
    'round must be ≥ 1',
  );
  assertThrows(
    () =>
      applyCircuitUpdate(baseline, 'v5.3-identity', -1, 'alice', '2026-05-05T18:00:00Z'),
    'round must be ≥ 1',
  );
  assertThrows(
    () =>
      applyCircuitUpdate(
        baseline,
        'v5.3-identity',
        1.5,
        'alice',
        '2026-05-05T18:00:00Z',
      ),
    'round must be ≥ 1',
  );
});

test('validateStatusPayload accepts v2 payload (no circuits field)', () => {
  validateStatusPayload(baseline); // no throw
});

test('validateStatusPayload accepts v3 payload (with valid circuits map)', () => {
  const v3 = applyCircuitUpdate(
    baseline,
    'v5.3-identity',
    1,
    'alice',
    '2026-05-05T18:00:00Z',
  );
  validateStatusPayload(v3); // no throw
});

test('validateStatusPayload rejects circuits with malformed entry', () => {
  const bad = {
    ...baseline,
    circuits: {
      'v5.3-identity': {
        round: 'not-a-number',
        lastContributor: 'alice',
        lastContributedAt: null,
      },
    },
  };
  assertThrows(
    () => validateStatusPayload(bad),
    'circuits[v5.3-identity].round must be a non-negative integer',
  );
});

test('validateStatusPayload rejects circuits with non-string lastContributor', () => {
  const bad = {
    ...baseline,
    circuits: {
      'v5.3-identity': {
        round: 1,
        lastContributor: 42, // not string|null
        lastContributedAt: null,
      },
    },
  };
  assertThrows(
    () => validateStatusPayload(bad),
    'circuits[v5.3-identity].lastContributor must be string|null',
  );
});

test('validateStatusPayload rejects circuits as array', () => {
  const bad = {
    ...baseline,
    circuits: [],
  };
  assertThrows(() => validateStatusPayload(bad), 'circuits must be an object');
});

async function main(): Promise<void> {
  let passed = 0;
  const failures: { name: string; error: Error }[] = [];
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${t.name}`);
      failures.push({ name: t.name, error: e as Error });
    }
  }
  console.log(`\n${passed}/${tests.length} passed`);
  if (failures.length > 0) {
    for (const { name, error } of failures) {
      console.error(`\nFAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
