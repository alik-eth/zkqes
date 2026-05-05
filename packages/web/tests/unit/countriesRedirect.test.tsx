// Unit tests for `/countries` redirect — soft-bounces direct loads
// (and bronze-tile redirects from T10) into Landing's `#coverage`
// anchor, where T14 lands the CountryGrid.
//
// Plan §T11 + lead's `replace: true` heads-up:
//   - `useEffect` fires `navigate({ to: '/', hash: 'coverage', replace: true })`.
//   - `replace: true` is load-bearing — bronze tile redirects via
//     `/qtsp/.../...` → `/countries` → `/#coverage` MUST NOT pollute
//     the back-button stack with the bronze URL. Otherwise back from
//     `#coverage` returns to the bronze URL and re-fires the redirect:
//     infinite-loop UX.
//
// Mock `useNavigate` from TanStack Router (per the existing CountryGrid
// + qtspPage convention). Test asserts the navigate call shape, not
// real navigation.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CountriesRedirect } from '../../src/routes/countriesRedirect';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
});

describe('CountriesRedirect', () => {
  it('navigates to / with #coverage hash + replace=true on mount', () => {
    render(<CountriesRedirect />);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/',
      hash: 'coverage',
      replace: true,
    });
  });

  it('navigate fires exactly once even on re-render', () => {
    const { rerender } = render(<CountriesRedirect />);
    rerender(<CountriesRedirect />);
    rerender(<CountriesRedirect />);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders nothing visible (or null) — pure side-effect surface', () => {
    const { container } = render(<CountriesRedirect />);
    // The redirect is observable via the navigate call, not the DOM.
    // Whatever the component renders should be either null or a
    // single placeholder; assert it has no interactive content.
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('explicitly passes `replace: true` (back-button stack guard)', () => {
    // Frozen-shape assertion specifically for `replace: true` since
    // dropping it creates an infinite-loop UX with the T10 bronze
    // redirect chain. Catches the regression at test-time.
    render(<CountriesRedirect />);
    const call = mockNavigate.mock.calls[0]?.[0];
    expect(call).toMatchObject({ replace: true });
  });
});
