import { test } from '@playwright/test';

// Civic-terminal v3 (Task #87, 2026-05-05): default `/` (VITE_TARGET=app)
// renders <HomeDocument />, which has no `view your certificate` button —
// that V4-era state lived on <AppRegisterLanding /> + <MintButton />,
// retired from `/` in favor of the document landing. The "returning
// holder" mint-NFT state is post-launch territory (V5 mint flow at
// /ua/mint when wired); re-enable this spec when that surface lands.

test.skip('returning holder sees view-certificate state — V4 LandingHero retired with v3 (#87)', () => {
  // intentionally empty; spec re-enabled when /ua/mint lands.
});
