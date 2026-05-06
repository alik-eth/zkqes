// Unit tests for CountryGrid — Landing's country/QTSP tile grid.
//
// Per lead's T9 dispatch:
//   - Prop-inject `index` rather than vi.mock'ing the generated module.
//     Default falls through to the real `QTSP_INDEX`; tests pass
//     synthetic fixtures.
//   - Silver+ tile click navigates to `/qtsp/<cc>/<slug>` even though
//     the route doesn't exist until T10. Test stubs `useNavigate`
//     from TanStack Router; nav payload correctness is what matters,
//     route-existence is T10's concern.
//   - Bronze tile click opens the drawer (no nav).
//
// react-i18next is mocked at module level per the existing convention.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { QtspMeta } from '@zkqes/sdk';
import { CountryGrid } from '../../src/components/qtsp/CountryGrid';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
});

function meta(country: string, slug: string, state: QtspMeta['state']): QtspMeta {
  return {
    country,
    qtspSlug: slug,
    displayName: `${country}/${slug}`,
    qtspUrl: 'https://example.invalid/',
    tslEntry: null,
    signingTool: { name: 'tool', url: 'https://example.invalid/', minVersion: null },
    state,
    addedAt: '2026-05-05',
    promotedAt: null,
    lastVerified: '2026-05-05',
    notes: 'synth',
    // V5.4 — required QtspMeta fields. Cross-field invariant requires
    // a non-null OID when dobEncoding !== 'none'.
    dobEncoding: 'diia-ua' as const,
    dobAttributeOid: '1.2.804.2.1.1.1.11.1.4.11.1',
    supportedFormats: ['CAdES'],
  };
}

const synthetic: QtspMeta[] = [
  meta('UA', 'diia', 'live'),
  meta('IT', 'aruba-pec', 'bronze'),
  meta('DE', 'd-trust', 'silver'),
  meta('FI', 'digi-fi', 'gold'),
];

describe('CountryGrid', () => {
  it('renders all tiles from injected index, grouped under regional headings', () => {
    render(<CountryGrid index={synthetic} />);
    expect(screen.getByText('UA/diia')).toBeInTheDocument();
    expect(screen.getByText('IT/aruba-pec')).toBeInTheDocument();
    expect(screen.getByText('DE/d-trust')).toBeInTheDocument();
    expect(screen.getByText('FI/digi-fi')).toBeInTheDocument();
    // Region headings — read off the generated `qtsp.region.*` i18n
    // keys (the mock t() returns the key verbatim).
    expect(screen.getByText('qtsp.region.EASTERN_EU')).toBeInTheDocument();
    expect(screen.getByText('qtsp.region.NORDICS')).toBeInTheDocument();
    expect(screen.getByText('qtsp.region.SOUTHERN_EU')).toBeInTheDocument();
    expect(screen.getByText('qtsp.region.CENTRAL_EU')).toBeInTheDocument();
  });

  it('filter chip click filters tiles in real time', () => {
    render(<CountryGrid index={synthetic} />);
    // All four tiles visible initially.
    expect(screen.getByText('UA/diia')).toBeInTheDocument();
    expect(screen.getByText('IT/aruba-pec')).toBeInTheDocument();
    // Click the 'live' chip; only UA/diia remains.
    fireEvent.click(screen.getByTestId('qtsp-filter-live'));
    expect(screen.getByText('UA/diia')).toBeInTheDocument();
    expect(screen.queryByText('IT/aruba-pec')).toBeNull();
    expect(screen.queryByText('DE/d-trust')).toBeNull();
    expect(screen.queryByText('FI/digi-fi')).toBeNull();
    // Click 'all' to clear the filter.
    fireEvent.click(screen.getByTestId('qtsp-filter-all'));
    expect(screen.getByText('IT/aruba-pec')).toBeInTheDocument();
  });

  it('clicking a bronze tile opens the drawer (no navigation)', () => {
    render(<CountryGrid index={synthetic} />);
    fireEvent.click(screen.getByText('IT/aruba-pec'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Drawer header re-renders the displayName; both the tile and the
    // drawer carry it, so getAllByText is required here.
    const drawerInstances = screen.getAllByText('IT/aruba-pec');
    expect(drawerInstances.length).toBeGreaterThanOrEqual(2);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clicking a silver tile navigates to /qtsp/<cc>/<slug>', () => {
    render(<CountryGrid index={synthetic} />);
    fireEvent.click(screen.getByText('DE/d-trust'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/qtsp/DE/d-trust' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking a gold tile navigates to /qtsp/<cc>/<slug>', () => {
    render(<CountryGrid index={synthetic} />);
    fireEvent.click(screen.getByText('FI/digi-fi'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/qtsp/FI/digi-fi' });
  });

  it('clicking a live tile navigates to /qtsp/<cc>/<slug>', () => {
    render(<CountryGrid index={synthetic} />);
    fireEvent.click(screen.getByText('UA/diia'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/qtsp/UA/diia' });
  });

  it('closing drawer returns focus to the originating tile', () => {
    render(<CountryGrid index={synthetic} />);
    const tile = screen.getByText('IT/aruba-pec').closest('button')!;
    tile.focus();
    fireEvent.click(tile);
    // Drawer up; close it via Esc (one of three close paths).
    fireEvent.keyDown(window, { key: 'Escape' });
    // Drawer gone, focus restored to the tile button.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });

  it('renders an empty state when index is empty', () => {
    render(<CountryGrid index={[]} />);
    expect(screen.getByText('qtsp.grid.empty')).toBeInTheDocument();
  });

  it('regions render in the canonical order (Eastern → Nordics → Southern → Central → Western → Other)', () => {
    render(<CountryGrid index={synthetic} />);
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    // The four populated regions in `synthetic` are EASTERN, NORDICS,
    // SOUTHERN, CENTRAL — Western/Other have no entries so should be
    // absent. Order must match REGION_ORDER.
    expect(headings).toEqual([
      'qtsp.region.EASTERN_EU',
      'qtsp.region.NORDICS',
      'qtsp.region.SOUTHERN_EU',
      'qtsp.region.CENTRAL_EU',
    ]);
  });

  // Sanity check that the within() helper actually scopes to the
  // region — protects against future grid layout drift moving tiles
  // out of their region container.
  it('UA/diia tile is rendered under the EASTERN_EU region', () => {
    render(<CountryGrid index={synthetic} />);
    const easternHeading = screen.getByText('qtsp.region.EASTERN_EU');
    const easternSection = easternHeading.closest('section')!;
    expect(within(easternSection).getByText('UA/diia')).toBeInTheDocument();
  });
});
