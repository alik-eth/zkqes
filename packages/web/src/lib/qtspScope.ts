// Multi-QTSP facade T13 — `?qtsp=` param plumbing for the V5
// register flow.
//
// Three pieces:
//
//   1. `QtspScopeContext` — React context carrying the active QTSP
//      meta (or null for UA-default fallback). Provided at the
//      register-flow root; consumed by deep children that need to
//      scope copy or interpolate per-QTSP context into error
//      strings (Step4's pipeline-error rendering, future per-QTSP
//      signing-tool prompts in Step3, etc.).
//
//   2. `resolveQtspScope(raw, index)` — pure resolution rule for the
//      raw `?qtsp=` URL param. Returns the matching `QtspMeta` only
//      when the param is well-formed AND points at an entry in
//      `QTSP_INDEX` AND that entry's state is silver/gold/live.
//      Bronze tiles are NOT scopable here per spec §4.4 — they have
//      no register-flow surface, only the drawer.
//
//   3. `formatCertBerInput(err, scope, t)` — picks between the
//      `errors.cert.berInput` (scoped) and `errors.cert.berInputGeneric`
//      (no QTSP context) i18n templates based on whether a QTSP scope
//      is in effect. Reads `reason` from the ZkqesError payload that
//      T4's `guardStrictDER` populates; hand-interpolates the
//      placeholder set so we don't depend on any specific i18next
//      runtime config.
//
// Spec: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md §4.4
// Plan: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md §T13

import { createContext, useContext } from 'react';
import type { QtspMeta } from '@zkqes/sdk';
import { ZkqesError } from './errors';
import { getQtspByPath } from './qtspIndex';

/**
 * Active QTSP scope for the register flow. `null` means UA-default
 * behavior (no `?qtsp=` param, or one that didn't resolve). Provider
 * lives at the route root; consumers use `useQtspScope()`.
 */
export const QtspScopeContext = createContext<QtspMeta | null>(null);

export function useQtspScope(): QtspMeta | null {
  return useContext(QtspScopeContext);
}

/**
 * Resolution rule for a raw `?qtsp=` URL parameter. Returns the
 * matching `QtspMeta` only when it's safe to scope the register flow
 * to that QTSP. Four "no-scope" cases (per spec §4.4):
 *
 *   (a) `raw` absent / empty
 *   (b) `raw` malformed (no `<cc>/<slug>` shape)
 *   (c) `raw` doesn't resolve in `index`
 *   (d) `raw` resolves but the entry is bronze (no register-flow
 *       surface)
 *
 * All four collapse to the same `null` return — the caller's
 * UA-default fallback.
 */
export function resolveQtspScope(
  raw: string | undefined | null,
  index: readonly QtspMeta[],
): QtspMeta | null {
  if (!raw) return null;
  const meta = getQtspByPath(index, raw);
  if (!meta) return null;
  // Bronze entries have no register-flow CTA on the per-QTSP page;
  // a `?qtsp=cc/<bronze>` URL is bookmark drift, not a scoping signal.
  if (meta.state === 'bronze') return null;
  return meta;
}

/** Minimal interpolation surface — enough to drive `i18next` t() or a
 *  test-time `(key, options) => string` mock. Callers passing the
 *  i18next `t` reference will need to cast it to this type because
 *  i18next's `TFunction` has overloads our helper doesn't model
 *  (defaultValue + namespaced variants); the cast is safe because
 *  we only ever invoke t(key, optionsObject). */
export type Interpolator = (
  key: string,
  options?: Record<string, string>,
) => string;

/**
 * Surface a `cert.berInput` `ZkqesError` through the i18n templates
 * wired in T6. Picks the scoped template when a QTSP context is in
 * effect (interpolates `qtspName` + `qtspUrl` + `reason`); falls
 * back to the generic template when scope is null (interpolates
 * `reason` only). Non-`cert.berInput` errors pass through with
 * their `.message` (or `String(err)` fallback).
 *
 * The `reason` payload field comes from T4's `guardStrictDER` —
 * one of `indefinite-length` / `non-minimal-length` /
 * `non-canonical-{integer,set,boolean,bit-string,null,oid}` /
 * `truncated`. The user-facing copy doesn't translate these
 * subreasons today; they read as English short-form within the
 * Ukrainian sentence too. Future polish.
 */
export function formatCertBerInput(
  err: unknown,
  scope: QtspMeta | null,
  t: Interpolator,
): string {
  if (!(err instanceof ZkqesError) || err.code !== 'cert.berInput') {
    if (err instanceof Error) return err.message;
    return String(err);
  }
  const reason =
    typeof err.details?.reason === 'string' ? err.details.reason : 'unknown';
  if (scope !== null) {
    return t('errors.cert.berInput', {
      qtspName: scope.displayName,
      qtspUrl: scope.qtspUrl,
      reason,
    });
  }
  return t('errors.cert.berInputGeneric', { reason });
}
