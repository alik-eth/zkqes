import { X509Certificate } from 'node:crypto';

import { MAX_LEAF_SPKI } from './keyCommit.js';

/**
 * Extract canonical DER bytes of a certificate's SubjectPublicKeyInfo,
 * algorithm-agnostic.
 *
 * V5.5 trust-list construction: the flattener commits trust-list leaves
 * via `keyCommit(spki)` (Poseidon-domain hash over the raw SPKI bytes),
 * which is algorithm-blind. Every QES-issuing CA in the trust list — be
 * it ECDSA-P256, RSA-2048/3072/4096, or any other algorithm whose
 * canonical SPKI fits within MAX_LEAF_SPKI bytes — round-trips through
 * the same code path with no per-algorithm branching.
 *
 * Compare to V5.x's `extractIntSpki.ts`, which pinned the exact 27-byte
 * ECDSA-P256 prefix and rejected anything else. That function remains
 * for legacy V5.x consumers.
 *
 * Throws if the SPKI exceeds MAX_LEAF_SPKI bytes — that's a hard cap at
 * the protocol layer (see V5.5 spec §5.3); a CA whose SPKI doesn't fit
 * needs a spec amendment first.
 */
export function extractSpki(certDer: Uint8Array): Uint8Array {
  const cert = new X509Certificate(Buffer.from(certDer));
  const spkiBuf = cert.publicKey.export({ type: 'spki', format: 'der' });
  if (!Buffer.isBuffer(spkiBuf)) {
    throw new Error('extractSpki: expected DER Buffer from publicKey.export');
  }
  const spki = new Uint8Array(spkiBuf);
  if (spki.length > MAX_LEAF_SPKI) {
    throw new Error(
      `extractSpki: SPKI length ${spki.length} exceeds MAX_LEAF_SPKI ${MAX_LEAF_SPKI}; ` +
        `update spec §5.3 sizing if a real QTSP issues larger SPKIs (e.g. RSA-8192 ~ 1100 bytes)`,
    );
  }
  return spki;
}
