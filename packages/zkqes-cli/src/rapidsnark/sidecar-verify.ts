// Runtime sha256 verification of the rapidsnark sidecar binary.
//
// Postinstall already verifies the .zip archive at download time
// (see postinstall.ts).  This module re-verifies the EXTRACTED
// `prover` binary at every `zkqes serve` boot — a tampered binary
// swapped onto disk between install and run (different malware on
// the user's machine, manual `cp` over the cache, etc.) would
// mismatch the embedded pin and abort startup.
//
// Skipped when the user passes `--rapidsnark-bin <path>` explicitly:
// that is the documented escape hatch for Windows from-source builds
// and integration tests; the user has accepted responsibility for
// the binary's provenance.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { PREBUILTS } from './prebuilts.js';
import {
  detectRapidsnarkPlatform,
  type RapidsnarkPlatform,
} from './sidecar-path.js';

export class SidecarVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SidecarVerifyError';
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return hash.digest('hex');
}

export interface VerifySidecarInput {
  readonly path: string;
  readonly platform?: RapidsnarkPlatform;
}

/**
 * Verifies the on-disk prover binary matches the embedded sha256 pin
 * for the host platform.  Throws SidecarVerifyError on mismatch or
 * if no pin exists for the host (which means the caller should be
 * using --rapidsnark-bin explicitly).
 */
export async function verifySidecarSha256(
  input: VerifySidecarInput,
): Promise<void> {
  const platform = input.platform ?? detectRapidsnarkPlatform();
  const entry = PREBUILTS[platform];
  if (!entry) {
    throw new SidecarVerifyError(
      `no embedded sha256 pin for platform ${platform}; ` +
        'pass --rapidsnark-bin <path> to skip runtime verification',
    );
  }
  const actual = await sha256File(input.path);
  if (actual !== entry.proverSha256) {
    throw new SidecarVerifyError(
      `rapidsnark sidecar sha256 mismatch at ${input.path}\n` +
        `  expected: ${entry.proverSha256}\n` +
        `  actual:   ${actual}\n` +
        'Binary may be tampered or wrong version. ' +
        'Re-run `zkqes cache clear && npm install -g @zkqes/cli` ' +
        'to redownload the verified prebuilt.',
    );
  }
}
