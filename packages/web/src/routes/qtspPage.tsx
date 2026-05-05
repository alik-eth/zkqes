// QtspPage — `/qtsp/$country/$qtsp` route. Renders the per-QTSP
// detail surface for a meta entry resolved from the build-time
// `QTSP_INDEX` (T5-emitted).
//
// Layout per spec §4.3:
//   - Header strip: flag · displayName · state badge.
//   - About: meta.notes.
//   - Recommended signing tool: name + url + minVersion.
//   - Parser status: derived from meta.state.
//   - Verified samples ledger: lazy-loaded from
//     `/qtsp-data/<cc>/<slug>/samples.json` (404 → "—").
//   - Trust anchors: lazy-loaded list of `/qtsp-data/<cc>/<slug>/
//     intermediates/*.pem` (404 → "—").
//   - State-driven CTA:
//     - silver → "Notify me when ready" form, same localStorage
//       prefix as the T8 drawer.
//     - gold   → "Try on testnet" link → `/v5/registerV5?qtsp=cc/slug`.
//     - live   → "Register" link → same path. T13 wires QTSP-aware
//       register-flow scoping; until then the gold/live CTAs land on
//       the existing register surface with the qtsp search-param.
//
// Routing semantics (for the wrapper, not the view):
//   - Unknown `<country>/<qtsp>` → soft redirect to `/countries#coverage`
//     (T11 lands the route; until then the redirect target is itself
//     a 404, expected per lead's T10 dispatch).
//   - `meta.state === 'bronze'` → same redirect; bronze tiles never
//     link here from the grid (drawer-only fast path), URL-typing
//     or stale bookmark could land. SEO + UX want "not yet promoted",
//     not "missing".

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { QtspMeta } from '@zkqes/sdk';
import { QTSP_INDEX } from '../generated/qtsp-index';
import { getQtspByPath } from '../lib/qtspIndex';
import { NOTIFY_STORAGE_PREFIX } from '../components/qtsp/QtspDrawer';

// ── Helpers ───────────────────────────────────────────────────────

const REGION_DISPLAY: { of: (cc: string) => string | undefined } | undefined =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : undefined;
function countryName(cc: string): string {
  return REGION_DISPLAY?.of(cc) ?? cc;
}
function flagEmoji(cc: string): string {
  return [...cc]
    .map((c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)))
    .join('');
}

/**
 * Sample metadata as stored in the per-QTSP `samples.json`. Shape is
 * intentionally narrow — field names match what `samples.json`
 * contributors emit. Future fields are tolerated but ignored here.
 */
export interface QtspSample {
  id: string;
  sigAlg: string;
  verified: boolean;
  [k: string]: unknown;
}

// ── Pure-render view ──────────────────────────────────────────────

export interface QtspPageViewProps {
  meta: QtspMeta;
  samples: readonly QtspSample[] | null;
  intermediates: readonly string[] | null;
}

export function QtspPageView({
  meta,
  samples,
  intermediates,
}: QtspPageViewProps): JSX.Element {
  const { t } = useTranslation();
  const qtspPathParam = `${meta.country}/${meta.qtspSlug}`;

  return (
    <div
      className="ct"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: 'var(--ct-pad)',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {/* Header strip — flag, displayName, state badge. */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span aria-label={countryName(meta.country)} role="img" style={{ fontSize: '24px' }}>
          {flagEmoji(meta.country)}
        </span>
        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: '36px',
            lineHeight: 1,
            margin: 0,
            flex: 1,
          }}
        >
          {meta.displayName}
        </h1>
        <span className={meta.state === 'live' ? 'ct-tag ct-tag--ok' : 'ct-tag'}>
          {t(`qtsp.state.${meta.state}`)}
        </span>
      </header>

      {/* About — meta.notes verbatim. */}
      <section>
        <h2 className="ct-kicker">{t('qtsp.page.about')}</h2>
        <p style={{ marginTop: '4px' }}>{meta.notes}</p>
      </section>

      {/* Signing tool — name + (optional) minVersion + url. */}
      <section>
        <h2 className="ct-kicker">{t('qtsp.page.signing')}</h2>
        <p style={{ marginTop: '4px' }}>
          <a className="ct-link" href={meta.signingTool.url} target="_blank" rel="noopener noreferrer">
            {meta.signingTool.name}
          </a>
          {meta.signingTool.minVersion ? ` (≥ ${meta.signingTool.minVersion})` : null}
        </p>
      </section>

      {/* Parser status — derived from meta.state. */}
      <section>
        <h2 className="ct-kicker">{t('qtsp.page.parserStatus')}</h2>
        <p style={{ marginTop: '4px' }}>{t(`qtsp.state.${meta.state}`)}</p>
      </section>

      {/* Verified samples ledger — null = no data yet, [] = none verified. */}
      <section>
        <h2 className="ct-kicker">{t('qtsp.page.samplesLedger')}</h2>
        {samples === null ? (
          <p style={{ marginTop: '4px', color: 'var(--ct-mute)' }}>—</p>
        ) : samples.length === 0 ? (
          <p style={{ marginTop: '4px', color: 'var(--ct-mute)' }}>
            {t('qtsp.grid.empty')}
          </p>
        ) : (
          <ul className="ct-stack" style={{ listStyle: 'none', padding: 0, marginTop: '4px' }}>
            {samples.map((s) => (
              <li key={s.id} className="ct-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span>{s.id}</span>
                <span style={{ color: 'var(--ct-mute)' }}>{s.sigAlg}</span>
                <span style={{ color: s.verified ? 'var(--ok)' : 'var(--err)' }}>
                  {s.verified ? '✓' : '✗'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Trust anchors — list of intermediate cert filenames. */}
      <section>
        <h2 className="ct-kicker">{t('qtsp.page.trustAnchors')}</h2>
        {intermediates === null ? (
          <p style={{ marginTop: '4px', color: 'var(--ct-mute)' }}>—</p>
        ) : intermediates.length === 0 ? (
          <p style={{ marginTop: '4px', color: 'var(--ct-mute)' }}>
            {t('qtsp.grid.empty')}
          </p>
        ) : (
          <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
            {intermediates.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </section>

      {/* State-driven CTA. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {meta.state === 'silver' ? (
          <NotifyMeForm meta={meta} ctaKey="qtsp.page.cta.silver" />
        ) : meta.state === 'gold' ? (
          <Link
            to="/v5/registerV5"
            search={{ qtsp: qtspPathParam }}
            className="ct-btn ct-btn--primary"
          >
            {t('qtsp.page.cta.gold')}
          </Link>
        ) : meta.state === 'live' ? (
          <Link
            to="/v5/registerV5"
            search={{ qtsp: qtspPathParam }}
            className="ct-btn ct-btn--primary"
          >
            {t('qtsp.page.cta.live')}
          </Link>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Notify-me form for silver-state QTSPs. Reuses the
 * `NOTIFY_STORAGE_PREFIX` from T8 so writes from the per-QTSP page
 * land in the same localStorage bucket as bronze drawer writes —
 * one downstream "list pending notifies" reader.
 */
function NotifyMeForm({
  meta,
  ctaKey,
}: {
  meta: QtspMeta;
  ctaKey: string;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const email = (form.elements.namedItem('email') as HTMLInputElement | null)?.value;
        if (!email) return;
        const key = `${NOTIFY_STORAGE_PREFIX}${meta.country}/${meta.qtspSlug}`;
        try {
          globalThis.localStorage?.setItem(
            key,
            JSON.stringify({ email, requestedAt: new Date().toISOString() }),
          );
        } catch {
          // localStorage may be blocked — soft-failure matches T8.
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <label htmlFor="qtsp-page-notify-email" className="ct-kicker">
        email
      </label>
      <input
        id="qtsp-page-notify-email"
        name="email"
        type="email"
        required
        className="ct-input ct-input--paper"
        autoComplete="email"
      />
      <button type="submit" className="ct-btn ct-btn--primary">
        {t(ctaKey)}
      </button>
    </form>
  );
}

// ── Route wrapper ─────────────────────────────────────────────────

export default function QtspPage(): JSX.Element | null {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { country?: string; qtsp?: string };
  const path = `${params.country ?? ''}/${params.qtsp ?? ''}`;
  const meta = getQtspByPath(QTSP_INDEX, path);

  // Unknown slug OR bronze entry → soft redirect to /countries#coverage.
  // T11 lands the redirect target; until then it 404s, expected.
  const shouldRedirect = !meta || meta.state === 'bronze';
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: '/countries', hash: 'coverage' });
    }
  }, [navigate, shouldRedirect]);

  // Lazy fetches — runtime data lives at `/qtsp-data/<cc>/<slug>/...`
  // (T5 plugin extension mirrors `samples.json` + `intermediates/*.pem`
  // from the source tree). 404 → null per lead's heads-up #3.
  const [samples, setSamples] = useState<readonly QtspSample[] | null>(null);
  // Intermediates listing isn't fetchable directly — no static dir
  // listing without a server-side index. T16+ will emit a JSON
  // manifest the plugin generates alongside the samples.json mirror.
  // For now the section renders the "—" placeholder.
  const intermediates: readonly string[] | null = null;

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    void (async () => {
      const base = `/qtsp-data/${meta.country}/${meta.qtspSlug}`;
      try {
        const r = await fetch(`${base}/samples.json`);
        if (!cancelled && r.ok) {
          const json = (await r.json()) as QtspSample[];
          setSamples(json);
        }
      } catch {
        // Silent — null sentinel covers the failure path.
      }
      // Intermediates listing isn't fetchable directly (no static dir
      // listing). T16+ may emit a JSON manifest; for now leave as null.
    })();
    return () => {
      cancelled = true;
    };
  }, [meta]);

  if (shouldRedirect || !meta) return null;
  return (
    <QtspPageView meta={meta} samples={samples} intermediates={intermediates} />
  );
}
