// Embedded manifest of iden3 rapidsnark v0.0.8 prebuilts.  Single
// source of truth for the four (url, sha256) pairs used by:
//
//   - postinstall.ts: download-time verification
//   - sidecar-verify.ts: runtime startup verification
//
// Pins captured 2026-05-03 against the iden3/rapidsnark v0.0.8
// GitHub release; independently verified by curl + sha256sum.
//
// v0.0.8 ships NO Windows binary — Windows users build rapidsnark
// from source and pass --rapidsnark-bin <path>; runtime verification
// is then skipped (caller's responsibility).

import type { RapidsnarkPlatform } from './sidecar-path.js';

export interface PrebuildEntry {
  readonly url: string;
  /** sha256 of the .zip archive (download-time check). */
  readonly archiveSha256: string;
  /** sha256 of the extracted `prover` binary (runtime check). */
  readonly proverSha256: string;
  readonly archiveType: 'zip';
  readonly proverPathInArchive: string;
}

export const PREBUILTS: Partial<Record<RapidsnarkPlatform, PrebuildEntry>> = {
  'linux-x86_64': {
    url: 'https://github.com/iden3/rapidsnark/releases/download/v0.0.8/rapidsnark-linux-x86_64-v0.0.8.zip',
    archiveSha256: '2ec59e3aa5ff498e862d60b3b7abdcd094ea484271750ec1ea14fb7c1305e423',
    proverSha256: 'f991d5f8447789dabe38a9b0f6a69678aaf4f5b4ecb91da7690cc8a4c0caae58',
    archiveType: 'zip',
    proverPathInArchive: 'rapidsnark-linux-x86_64-v0.0.8/bin/prover',
  },
  'linux-arm64': {
    url: 'https://github.com/iden3/rapidsnark/releases/download/v0.0.8/rapidsnark-linux-arm64-v0.0.8.zip',
    archiveSha256: '704dfbaa6847d4ddf5f63bf7bc8d3e59f007c33e2d8ab16b318090d671253dbd',
    proverSha256: 'ec0609e4bd716544fa1d849e90d5d6779f5ab22b65c9bad8e97e9f9adfca5c39',
    archiveType: 'zip',
    proverPathInArchive: 'rapidsnark-linux-arm64-v0.0.8/bin/prover',
  },
  'macOS-arm64': {
    url: 'https://github.com/iden3/rapidsnark/releases/download/v0.0.8/rapidsnark-macOS-arm64-v0.0.8.zip',
    archiveSha256: 'dbd2c1498663223232f9c3ad02259d2839e62e784e9b1f6a0e9bd5070443990d',
    proverSha256: '033b5bc0d0e11a81713dcd8c8935ac2b404ce2ecefd49640f47362129b5abe34',
    archiveType: 'zip',
    proverPathInArchive: 'rapidsnark-macOS-arm64-v0.0.8/bin/prover',
  },
  'macOS-x86_64': {
    url: 'https://github.com/iden3/rapidsnark/releases/download/v0.0.8/rapidsnark-macOS-x86_64-v0.0.8.zip',
    archiveSha256: 'df116044e6edfd409aa198a9bc828f0f038ddfeaa3243d350460da3a08376631',
    proverSha256: '6b3643be25671dd903b232e929931b22e7e8d9dec1a7530cd5aeb90925ac4ada',
    archiveType: 'zip',
    proverPathInArchive: 'rapidsnark-macOS-x86_64-v0.0.8/bin/prover',
  },
};
