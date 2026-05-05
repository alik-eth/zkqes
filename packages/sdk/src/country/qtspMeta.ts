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

export const QtspMetaSchema = z.object({
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
});
export type QtspMeta = z.infer<typeof QtspMetaSchema>;
