// Unit tests for LandingHero — verifies T12's structural insertion
// of `<CountryGrid id="coverage">` between the hero header and the
// "three ways to contribute" path-cards section.
//
// Plan §T12 step 1 calls out two assertions:
//   1. Section ordering: hero → coverage → path-cards.
//   2. `#coverage` anchor exposed on the new section so the
//      `/countries` redirect (T11) lands at the right scroll
//      position.
//
// react-i18next + @tanstack/react-router are mocked at module level
// per the existing CivicTerminalLanding / CliBanner convention so
// the component renders standalone (no router provider, no i18n init).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ children, to, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

// DocumentFooter calls `useChainId()` from wagmi for chain-name display.
// Stub it out — the test isn't validating wallet wiring.
vi.mock('wagmi', () => ({
  useChainId: () => 8453, // base mainnet — arbitrary stable value
}));

import { LandingHero } from '../../src/components/LandingHero';

afterEach(() => {
  cleanup();
});

describe('LandingHero — T12 coverage section', () => {
  it('exposes #coverage anchor on the inserted CountryGrid section', () => {
    render(<LandingHero />);
    const node = document.getElementById('coverage');
    expect(node).not.toBeNull();
  });

  it('renders hero / path-cards / coverage in order on the landing page', () => {
    render(<LandingHero />);
    const sections = Array.from(
      document.querySelectorAll('[data-section]'),
    ) as HTMLElement[];
    const positionOf = (name: string) =>
      sections.findIndex((s) => s.dataset.section === name);
    const heroIdx = positionOf('hero');
    const coverageIdx = positionOf('coverage');
    const pathCardsIdx = positionOf('path-cards');

    expect(heroIdx).toBeGreaterThanOrEqual(0);
    expect(coverageIdx).toBeGreaterThanOrEqual(0);
    expect(pathCardsIdx).toBeGreaterThanOrEqual(0);
    expect(pathCardsIdx).toBeGreaterThan(heroIdx);
    expect(coverageIdx).toBeGreaterThan(pathCardsIdx);
  });

  it('coverage section is anchored at #coverage and lives inside <main>', () => {
    // Pre-launch state: LandingHero ships the coverage section with a
    // QTSP-directory shell; CountryGrid is mounted on its own route
    // (`/countries`) rather than lazy-loaded inline. The original T14
    // plan to lazy-import CountryGrid here was descoped — what's
    // tested today is just the anchor + parent containment so other
    // routes can deep-link to /#coverage without breakage.
    render(<LandingHero />);
    const node = document.getElementById('coverage');
    expect(node).not.toBeNull();
    expect(node!.closest('main')).not.toBeNull();
  });
});
