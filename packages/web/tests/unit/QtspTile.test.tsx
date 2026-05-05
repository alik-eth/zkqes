// Unit tests for QtspTile — the country-grid cell on Landing.
//
// Plan §T7 calls out three baseline cases (renders displayName + flag,
// calls onClick with meta, applies state-specific styling). Adding two
// targeted extras:
//
//   - state badge i18n key is the one consumed (catches drift between
//     the QtspMeta.state enum and the i18n namespace shape we wired
//     in T6).
//   - the tile is a real <button> (a11y baseline — matters for
//     keyboard navigation on the country grid).
//
// react-i18next is mocked at module level per the CliBanner +
// use-chain-deployment convention so the component renders
// standalone (no i18next.init, no provider). The mock surfaces the
// raw key, which is exactly what the assertions key off.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { QtspMeta } from '@zkqes/sdk';
import { QtspTile } from '../../src/components/qtsp/QtspTile';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

afterEach(() => {
  cleanup();
});

const baseMeta: QtspMeta = {
  country: 'IT',
  qtspSlug: 'aruba-pec',
  displayName: 'Aruba PEC',
  qtspUrl: 'https://www.pec.it/',
  tslEntry: null,
  signingTool: {
    name: 'ArubaSign',
    url: 'https://www.pec.it/firma-digitale.aspx',
    minVersion: null,
  },
  state: 'bronze',
  addedAt: '2026-05-05',
  promotedAt: null,
  lastVerified: '2026-05-05',
  notes: 'Italian QTSP — paper-trail only, no parser yet.',
};

describe('QtspTile', () => {
  it('renders displayName + country flag with country-name aria-label', () => {
    render(<QtspTile meta={baseMeta} onClick={vi.fn()} />);
    expect(screen.getByText('Aruba PEC')).toBeInTheDocument();
    // Native emoji flag rendered inside an aria-labeled span — country
    // name comes from `Intl.DisplayNames(['en'], { type: 'region' })`.
    // Lookup is hard-pinned to 'en' so the a11y label stays stable
    // across user-agent locale changes.
    expect(screen.getByLabelText('Italy')).toBeInTheDocument();
  });

  it('calls onClick with meta when the tile is activated', () => {
    const onClick = vi.fn();
    render(<QtspTile meta={baseMeta} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(baseMeta);
  });

  it('exposes data-state for state-distinct CSS chrome', () => {
    const { container, rerender } = render(
      <QtspTile meta={{ ...baseMeta, state: 'live' }} onClick={vi.fn()} />,
    );
    expect(container.querySelector('[data-state="live"]')).not.toBeNull();
    rerender(<QtspTile meta={{ ...baseMeta, state: 'gold' }} onClick={vi.fn()} />);
    expect(container.querySelector('[data-state="gold"]')).not.toBeNull();
    rerender(<QtspTile meta={{ ...baseMeta, state: 'silver' }} onClick={vi.fn()} />);
    expect(container.querySelector('[data-state="silver"]')).not.toBeNull();
    rerender(
      <QtspTile meta={{ ...baseMeta, state: 'bronze' }} onClick={vi.fn()} />,
    );
    expect(container.querySelector('[data-state="bronze"]')).not.toBeNull();
  });

  it('renders state badge via the matching qtsp.state.<state> i18n key', () => {
    // The mocked `t` returns the key verbatim, so assertions read the
    // i18n key directly. Catches drift between QtspMeta.state values
    // and the qtsp.state.* namespace wired in T6.
    const { rerender } = render(
      <QtspTile meta={{ ...baseMeta, state: 'bronze' }} onClick={vi.fn()} />,
    );
    expect(screen.getByText('qtsp.state.bronze')).toBeInTheDocument();
    rerender(<QtspTile meta={{ ...baseMeta, state: 'live' }} onClick={vi.fn()} />);
    expect(screen.getByText('qtsp.state.live')).toBeInTheDocument();
  });

  it('renders as a <button> for keyboard a11y', () => {
    render(<QtspTile meta={baseMeta} onClick={vi.fn()} />);
    const node = screen.getByRole('button');
    expect(node.tagName).toBe('BUTTON');
    expect(node).toHaveAttribute('type', 'button');
  });
});
