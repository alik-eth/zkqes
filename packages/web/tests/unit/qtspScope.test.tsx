// Unit tests for the T13 `qtspScope` helper module.
//
// Three scopes:
//   - `resolveQtspScope`: pure resolution rule for `?qtsp=` raw param.
//     Covers all four "no-scope" cases (absent / malformed /
//     not-in-index / bronze) plus the happy path.
//   - `formatCertBerInput`: i18n template selection for the T4
//     `cert.berInput` ZkqesError. Asserts both the scoped and the
//     generic branch interpolate the right placeholder set.
//   - `QtspScopeContext` + `useQtspScope`: round-trip through a
//     React Provider/consumer pair (smoke test for the context
//     plumbing).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QtspMeta } from '@zkqes/sdk';
import { ZkqesError } from '@zkqes/sdk';
import {
  QtspScopeContext,
  formatCertBerInput,
  resolveQtspScope,
  useQtspScope,
} from '../../src/lib/qtspScope';

function meta(country: string, slug: string, state: QtspMeta['state']): QtspMeta {
  return {
    country,
    qtspSlug: slug,
    displayName: `${country} ${slug}`,
    qtspUrl: `https://${country.toLowerCase()}.example/`,
    tslEntry: null,
    signingTool: { name: `${slug}-signer`, url: 'https://example.invalid/', minVersion: null },
    state,
    addedAt: '2026-05-05',
    promotedAt: state === 'live' ? '2026-05-05' : null,
    lastVerified: '2026-05-05',
    notes: '',
  };
}

const INDEX: QtspMeta[] = [
  meta('UA', 'diia', 'live'),
  meta('IT', 'aruba-pec', 'bronze'),
  meta('DE', 'd-trust', 'silver'),
  meta('FI', 'digi-fi', 'gold'),
];

// ── resolveQtspScope ──────────────────────────────────────────────

describe('resolveQtspScope', () => {
  it('resolves a valid silver/gold/live slug to its meta', () => {
    expect(resolveQtspScope('UA/diia', INDEX)?.qtspSlug).toBe('diia');
    expect(resolveQtspScope('DE/d-trust', INDEX)?.state).toBe('silver');
    expect(resolveQtspScope('FI/digi-fi', INDEX)?.state).toBe('gold');
  });

  it('case-insensitive on both segments (matches getQtspByPath)', () => {
    expect(resolveQtspScope('ua/DIIA', INDEX)?.country).toBe('UA');
  });

  it('returns null when raw is absent / empty / null / undefined', () => {
    expect(resolveQtspScope(undefined, INDEX)).toBeNull();
    expect(resolveQtspScope(null, INDEX)).toBeNull();
    expect(resolveQtspScope('', INDEX)).toBeNull();
  });

  it('returns null when raw is malformed (no <cc>/<slug> shape)', () => {
    expect(resolveQtspScope('this-is-garbage', INDEX)).toBeNull();
    expect(resolveQtspScope('/missing-cc', INDEX)).toBeNull();
    expect(resolveQtspScope('cc/', INDEX)).toBeNull();
  });

  it('returns null when raw is well-formed but not in index', () => {
    expect(resolveQtspScope('XX/nope', INDEX)).toBeNull();
  });

  it('returns null for bronze entries (no register-flow surface)', () => {
    expect(resolveQtspScope('IT/aruba-pec', INDEX)).toBeNull();
  });
});

// ── formatCertBerInput ────────────────────────────────────────────

describe('formatCertBerInput', () => {
  // Identity interpolator — returns the key + JSON-shaped options
  // so test assertions can read both back without owning an i18n
  // runtime.
  const idT = (k: string, o?: Record<string, string>): string =>
    o ? `${k}|${JSON.stringify(o)}` : k;

  it('uses errors.cert.berInput when scope is present, interpolating qtspName/qtspUrl/reason', () => {
    const err = new ZkqesError('cert.berInput', {
      reason: 'indefinite-length',
      offset: 0,
      where: 'p7s-envelope',
    });
    const scope = meta('UA', 'diia', 'live');
    const out = formatCertBerInput(err, scope, idT);
    expect(out).toContain('errors.cert.berInput');
    expect(out).toContain('qtspName');
    expect(out).toContain('UA diia');
    expect(out).toContain('qtspUrl');
    expect(out).toContain('https://ua.example/');
    expect(out).toContain('indefinite-length');
  });

  it('uses errors.cert.berInputGeneric when scope is null, interpolating reason only', () => {
    const err = new ZkqesError('cert.berInput', {
      reason: 'non-canonical-set',
    });
    const out = formatCertBerInput(err, null, idT);
    expect(out).toContain('errors.cert.berInputGeneric');
    expect(out).toContain('non-canonical-set');
    expect(out).not.toContain('qtspName');
    expect(out).not.toContain('qtspUrl');
  });

  it('passes through non-ZkqesError errors with their .message', () => {
    expect(formatCertBerInput(new Error('boom'), null, idT)).toBe('boom');
  });

  it('passes through non-cert.berInput ZkqesErrors with .message', () => {
    const err = new ZkqesError('qes.sigInvalid');
    expect(formatCertBerInput(err, null, idT)).toBe('qes.sigInvalid');
  });

  it('handles missing reason payload — falls back to "unknown"', () => {
    // T4 always populates reason, but defensive against future code
    // paths that throw cert.berInput without it.
    const err = new ZkqesError('cert.berInput');
    const out = formatCertBerInput(err, null, idT);
    expect(out).toContain('unknown');
  });
});

// ── QtspScopeContext / useQtspScope ───────────────────────────────

describe('QtspScopeContext + useQtspScope', () => {
  function Probe() {
    const scope = useQtspScope();
    return <div data-testid="probe">{scope?.qtspSlug ?? 'none'}</div>;
  }

  it('default value is null', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('none');
  });

  it('Provider passes a QtspMeta to consumers', () => {
    const value = meta('DE', 'd-trust', 'silver');
    render(
      <QtspScopeContext.Provider value={value}>
        <Probe />
      </QtspScopeContext.Provider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('d-trust');
  });
});
