// Multi-circuit ceremony dry-run — local in-memory simulation of the
// per-circuit `applyCircuitUpdate` chain across N synthetic contributors
// × 2 circuits (V5.3 identity + V5.4 age-Diia-UA).
//
// Catches plumbing bugs in the per-circuit isolation invariant + round
// monotonicity gates BEFORE real contributors arrive. Doesn't run snarkjs,
// doesn't touch R2, doesn't read pending/round-N.json files — pure
// in-memory test of the publish-status state-transition logic.
//
// Usage:
//   pnpm tsx scripts/ceremony-multi-circuit-dryrun.ts --rounds 2
//   pnpm tsx scripts/ceremony-multi-circuit-dryrun.ts --rounds 5 --verbose
//
// What it validates per round, per circuit:
//   - applyCircuitUpdate adds the new entry under circuits[name]
//   - lastContributor / lastContributedAt advance correctly
//   - per-circuit round counter advances (prev+1)
//   - cross-circuit isolation: updating one circuit leaves the other's
//     state byte-identical to its prior step
//   - top-level round/contributors NOT touched (multi-circuit isolation
//     against the legacy global counter)
//   - validateStatusPayload accepts the running payload at every step
//
// Exit codes:
//   0 = all assertions passed across all rounds × circuits
//   1 = an assertion failed (stderr line surfaces which contributor /
//       circuit / step tripped it)
//
// What this is NOT:
//   - A live ceremony. Real Phase B fire is `publish-status.ts --circuit
//     <name> --round <N> --commit` per contributor per circuit, against
//     R2-backed status.json with optimistic-concurrency etag guards.
//   - An snarkjs round-trip. Real per-contributor flow is `snarkjs zkey
//     contribute prev.zkey next.zkey -e=<entropy>` then `verify-contribution.ts`
//     checks the attestation against the chain. The dry-run simulates the
//     final state shape only.
//   - A web-side render check. Visual confirmation that the Ceremony D
//     Split route handles the v3 schema is lead's pump-pickup.

import { parseArgs } from 'node:util';
import {
  applyCircuitUpdate,
  validateStatusPayload,
  KNOWN_CIRCUITS,
  type CeremonyStatusPayload,
  type CeremonyCircuit,
} from '../src/types.ts';

interface Args {
  rounds: number;
  verbose: boolean;
}

function parseCliArgs(): Args {
  const { values } = parseArgs({
    options: {
      rounds: { type: 'string', default: '2' },
      verbose: { type: 'boolean', default: false },
    },
  });
  const rounds = Number(values.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 50) {
    throw new Error(`--rounds must be integer in [1, 50], got ${values.rounds}`);
  }
  return { rounds, verbose: values.verbose ?? false };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

/**
 * Deterministic synthetic contributor name. Stable across runs — the
 * dry-run is reproducible bit-for-bit (modulo the timestamp string,
 * which is also derived from a deterministic seed below).
 */
function syntheticContributor(round: number): string {
  return `synth-contrib-${String(round).padStart(3, '0')}`;
}

/**
 * Deterministic synthetic ISO-8601 timestamp. NOT real-clock — picked
 * from a fixed base + per-round offset so re-running the dry-run
 * produces byte-identical output for diff-stable CI runs.
 */
function syntheticTimestamp(round: number, circuit: CeremonyCircuit): string {
  // Base: 2026-05-05T18:00:00Z. Per-round +1 hr; per-circuit +1 min so the
  // V5.3 + V5.4 contributions in the same round are distinguishable.
  const baseHour = 18 + round - 1;
  const minute = circuit === 'v5.3-identity' ? 0 : 1;
  const hh = String(baseHour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `2026-05-05T${hh}:${mm}:00Z`;
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

async function main(): Promise<void> {
  const args = parseCliArgs();

  console.log(`=== Multi-circuit ceremony dry-run ===`);
  console.log(`Contributors: ${args.rounds}`);
  console.log(`Circuits: ${KNOWN_CIRCUITS.join(', ')}`);
  console.log(`Initial payload phase: ${baseline.phase}`);
  console.log();

  // Initial payload validates (back-compat: v2-shaped payload with no
  // circuits field passes the v3-extended validator).
  validateStatusPayload(baseline);

  let payload: CeremonyStatusPayload = baseline;
  let stepCount = 0;

  for (let round = 1; round <= args.rounds; round++) {
    if (args.verbose) console.log(`--- Round ${round} ---`);

    for (const circuit of KNOWN_CIRCUITS) {
      stepCount++;

      // Capture every other circuit's state BEFORE the update — used to
      // assert isolation invariant after.
      const beforeOthers: Partial<Record<CeremonyCircuit, unknown>> = {};
      for (const other of KNOWN_CIRCUITS) {
        if (other !== circuit) {
          beforeOthers[other] = JSON.stringify(payload.circuits?.[other] ?? null);
        }
      }

      // Capture top-level fields BEFORE the update.
      const beforeTopRound = payload.round;
      const beforeTopContribs = payload.contributors.length;

      const contributor = syntheticContributor(round);
      const contributedAt = syntheticTimestamp(round, circuit);

      payload = applyCircuitUpdate(payload, circuit, round, contributor, contributedAt);

      // === Per-circuit assertions ===
      const entry = payload.circuits?.[circuit];
      assert(entry, `step ${stepCount}: circuits[${circuit}] should exist after update`);
      assert(
        entry!.round === round,
        `step ${stepCount}: circuits[${circuit}].round expected ${round}, got ${entry!.round}`,
      );
      assert(
        entry!.lastContributor === contributor,
        `step ${stepCount}: circuits[${circuit}].lastContributor expected ${contributor}, got ${entry!.lastContributor}`,
      );
      assert(
        entry!.lastContributedAt === contributedAt,
        `step ${stepCount}: circuits[${circuit}].lastContributedAt expected ${contributedAt}, got ${entry!.lastContributedAt}`,
      );

      // === Cross-circuit isolation ===
      for (const other of KNOWN_CIRCUITS) {
        if (other === circuit) continue;
        const afterOther = JSON.stringify(payload.circuits?.[other] ?? null);
        assert(
          afterOther === beforeOthers[other],
          `step ${stepCount}: ISOLATION VIOLATED — updating ${circuit} mutated circuits[${other}] (before: ${beforeOthers[other]}, after: ${afterOther})`,
        );
      }

      // === Top-level fields untouched ===
      assert(
        payload.round === beforeTopRound,
        `step ${stepCount}: top-level round mutated (per-circuit update should not touch it)`,
      );
      assert(
        payload.contributors.length === beforeTopContribs,
        `step ${stepCount}: top-level contributors[] mutated (per-circuit update should not touch it)`,
      );

      // === Status payload validates ===
      validateStatusPayload(payload);

      if (args.verbose) {
        console.log(
          `  step ${stepCount}: ${circuit} round=${round} contributor=${contributor} ✓`,
        );
      }
    }
  }

  // === Final-state assertions ===
  console.log();
  console.log('--- Final state ---');
  for (const circuit of KNOWN_CIRCUITS) {
    const entry = payload.circuits?.[circuit];
    assert(entry, `final: circuits[${circuit}] missing`);
    assert(
      entry!.round === args.rounds,
      `final: circuits[${circuit}].round expected ${args.rounds}, got ${entry!.round}`,
    );
    console.log(
      `  circuits[${circuit}]: round=${entry!.round} lastContributor=${entry!.lastContributor} lastContributedAt=${entry!.lastContributedAt}`,
    );
  }
  console.log(`  top-level round: ${payload.round} (unchanged from baseline ${baseline.round})`);
  console.log(`  top-level contributors[]: ${payload.contributors.length} entries (unchanged)`);
  console.log(`  phase: ${payload.phase}`);

  console.log();
  console.log(
    `=== ${stepCount}/${stepCount} multi-circuit transitions verified across ${args.rounds} rounds × ${KNOWN_CIRCUITS.length} circuits ✓`,
  );
}

main().catch((e) => {
  console.error(`DRY-RUN FAILED: ${(e as Error).message}`);
  process.exit(1);
});
