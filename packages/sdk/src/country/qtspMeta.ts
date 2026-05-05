/**
 * QtspMeta — Zod schema for the per-(country, QTSP) metadata block that
 * lives at `fixtures/trust/<cc>/<qtsp-slug>/meta.json`.
 *
 * Every entry in the trust ingestion tree must be a `QtspMeta` document.
 * The build-time Vite plugin (T6, `packages/web/vite/plugin-qtsp-index.ts`)
 * walks `fixtures/trust/`, parses each `meta.json` against this schema, and
 * emits the typed `qtsp-index.ts` consumed by the Landing tile grid + the
 * `/qtsp/$country/$qtsp` route.
 *
 * Schema is intentionally explicit / over-validating:
 *   - country: ISO 3166-1 alpha-2, uppercase only (matches existing
 *     `SUPPORTED_COUNTRIES` convention).
 *   - qtspSlug: lowercase ASCII slug, no leading/trailing hyphen — matches
 *     the directory name verbatim (filesystem path = canonical id).
 *   - state: one of QTSP_STATES = ['bronze', 'silver', 'gold', 'live']
 *     (state machine documented in the multi-QTSP facade spec §2.2).
 *   - dates: ISO-8601 YYYY-MM-DD only; rejects locale-formatted strings.
 *
 * Spec: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md
 * Plan: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md T2
 */

import { z } from 'zod';

export const QTSP_STATES = ['bronze', 'silver', 'gold', 'live'] as const;
export type QtspState = (typeof QTSP_STATES)[number];

/**
 * DOB-encoding flavor surfaced in QTSP metadata for V5.4 age verification.
 *
 * - `'rfc-3739'` — Tier-1 profile (e.g., D-Trust DE, generic eIDAS QTSPs)
 *   carrying dateOfBirth per RFC 3739 (subject directory attribute, OID
 *   `1.3.6.1.5.5.7.9.1`). Reserved here for V5.5+; no Tier-1 circuit
 *   ships in V5.4.
 * - `'diia-ua'` — Tier-2 Ukraine/Diia profile that diverges from RFC
 *   3739; DOB lives inside a custom AttributeTypeAndValue under the
 *   subject DN (OID `1.2.804.2.1.1.1.11.1.4.11.1`). Per-country witness
 *   extractor required (`AgeDiiaUA` circuit family, V5.4 ships only
 *   this tier).
 * - `'none'` — QTSP does not surface DOB in any standard attribute. Age
 *   verification is unsupported for this QTSP until a Tier-N circuit
 *   ships; `dobAttributeOid` MUST be `null` in this case.
 *
 * Spec ref: `docs/superpowers/specs/2026-05-05-zkqes-v5_4-per-country-age-design.md` §7.
 * Orchestration ref: `docs/superpowers/plans/2026-05-05-zkqes-v5_4-orchestration.md` §1.5.
 */
export const DOB_ENCODINGS = ['rfc-3739', 'diia-ua', 'none'] as const;
export type DobEncoding = (typeof DOB_ENCODINGS)[number];

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const Iso3166Alpha2Upper = z
  .string()
  .regex(/^[A-Z]{2}$/, 'must be ISO 3166-1 alpha-2 uppercase');
// Slug regex rejects single-character slugs (any 1-letter QTSP would be
// weird) per lead's T2 guidance. `^[a-z0-9][a-z0-9-]*[a-z0-9]$` requires
// length ≥2, lowercase + digits + internal hyphens only, no leading or
// trailing hyphen.
const QtspSlug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'must be lowercase ASCII slug');
const HttpUrl = z.string().url();

export const SignerToolMetaSchema = z.object({
  name: z.string().min(1),
  url: HttpUrl,
  minVersion: z.string().nullable(),
});
export type SignerToolMeta = z.infer<typeof SignerToolMetaSchema>;

// Dotted-decimal ASN.1 OID (e.g., "1.2.804.2.1.1.1.11.1.4.11.1"). Two or
// more arcs, each non-negative; the trailing-arc-only regex `[\d]+(\.\d+)+`
// requires the dot-separated form (single-arc strings are rejected).
const Oid = z
  .string()
  .regex(/^\d+(\.\d+)+$/, 'must be dotted-decimal OID');

export const QtspMetaSchema = z
  .object({
    country: Iso3166Alpha2Upper,
    qtspSlug: QtspSlug,
    displayName: z.string().min(1),
    qtspUrl: HttpUrl,
    tslEntry: HttpUrl.nullable(),
    signingTool: SignerToolMetaSchema,
    state: z.enum(QTSP_STATES),
    addedAt: IsoDate,
    promotedAt: IsoDate.nullable(),
    lastVerified: IsoDate,
    notes: z.string(),
    /**
     * V5.4 — DOB-encoding flavor for age verification. See
     * `DOB_ENCODINGS` JSDoc above for per-value semantics.
     */
    dobEncoding: z.enum(DOB_ENCODINGS),
    /**
     * V5.4 — DOB attribute OID (dotted-decimal ASN.1). Required when
     * `dobEncoding !== 'none'`; MUST be `null` when `dobEncoding ===
     * 'none'`. Cross-field validity enforced by the `superRefine`
     * below.
     */
    dobAttributeOid: Oid.nullable(),
  })
  .superRefine((meta, ctx) => {
    // V5.4 cross-field invariant: dobAttributeOid presence is keyed off
    // the dobEncoding tag. 'none' requires null; any other tag requires
    // a concrete OID. Catches drift in fixture-author hand-edits before
    // the witness builder fails on a missing OID at runtime.
    if (meta.dobEncoding === 'none' && meta.dobAttributeOid !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dobAttributeOid'],
        message: "must be null when dobEncoding === 'none'",
      });
    }
    if (meta.dobEncoding !== 'none' && meta.dobAttributeOid === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dobAttributeOid'],
        message: `must be a dotted-decimal OID when dobEncoding === '${meta.dobEncoding}'`,
      });
    }
  });
export type QtspMeta = z.infer<typeof QtspMetaSchema>;
