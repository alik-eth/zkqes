// CountriesRedirect — pure side-effect surface that bounces direct
// loads of `/countries` (and bronze-tile redirects from T10) into
// Landing's `#coverage` anchor (T14 lands the CountryGrid there).
//
// `replace: true` is load-bearing — bronze tile redirects via
// `/qtsp/.../...` → `/countries` → `/#coverage` MUST NOT pollute the
// back-button stack with the bronze URL. Without `replace`, hitting
// back from `#coverage` returns the user to the bronze URL and
// re-fires the redirect: infinite-loop UX. With `replace`, back
// navigates to wherever the user came from before the bronze attempt.
//
// GH Pages SPA fallback (CLAUDE.md invariant 22) handles direct loads
// of `/countries`: index.html boots, TanStack Router resolves the
// route, the `useEffect` below fires the redirect.
//
// Spec: docs/superpowers/specs/2026-05-05-multi-qtsp-facade-design.md
// Plan: docs/superpowers/plans/2026-05-05-multi-qtsp-facade.md §T11

import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

export function CountriesRedirect(): null {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: '/', hash: 'coverage', replace: true });
    // navigate() is stable across renders per TanStack Router; including
    // it in deps would mean `useEffect` fires once anyway, but we guard
    // explicitly with `[]` to make the "fire-once on mount" semantics
    // visible. The 60-line test asserts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Default export for `lazyRouteComponent` in router.tsx. Even though
// the body is a one-liner, lazy-loading keeps the route's React +
// TanStack imports out of the landing entry chunk per CLAUDE.md
// invariant 21.
export default CountriesRedirect;
