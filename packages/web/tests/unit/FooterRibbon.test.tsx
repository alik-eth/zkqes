// FooterRibbon — every-surface civic-terminal chrome.
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 2.
// BRAND.md v2-amendment §Footer ribbon: `{BUILD_SHA_7} · {BUILD_DATE} · zkqes.org`.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FooterRibbon } from '../../src/components/civic-terminal/FooterRibbon';

describe('FooterRibbon', () => {
  it('renders sha · date · zkqes.org', () => {
    render(<FooterRibbon buildSha="abc1234" buildDate="2026-05-04" />);
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-04/)).toBeInTheDocument();
    expect(screen.getByText(/zkqes\.org/)).toBeInTheDocument();
  });

  it('truncates a longer SHA to 7 chars', () => {
    render(<FooterRibbon buildSha="abc1234567890" buildDate="2026-05-04" />);
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.queryByText(/abc1234567/)).not.toBeInTheDocument();
  });

  it('renders as a contentinfo landmark', () => {
    render(<FooterRibbon buildSha="abc1234" buildDate="2026-05-04" />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
