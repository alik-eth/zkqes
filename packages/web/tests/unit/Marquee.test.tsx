// Marquee — shared civic-terminal chrome (phase LED + round count + sidebar).
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 2.
//
// LED-color contract (BRAND.md §Phase-LED states):
//   recruiting    → yellow
//   ceremony-live → green
//   live          → blue
//
// Empty-state for `totalRounds === 0` is "round — of —" per HN-screenshot
// mitigation in plan §0.1. The LED's aria-label exposes the phase to screen
// readers so the colour is informational, not decorative.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Marquee } from '../../src/components/civic-terminal/Marquee';

describe('Marquee', () => {
  it('renders yellow LED + recruiting label when phase=recruiting', () => {
    render(
      <Marquee phase="recruiting" round={0} totalRounds={10} sidebarText="awaiting" />,
    );
    const led = screen.getByLabelText('phase: recruiting');
    expect(led).toBeInTheDocument();
    expect(led.getAttribute('data-led-color')).toBe('yellow');
    expect(screen.getByText(/round 0 of 10/i)).toBeInTheDocument();
  });

  it('renders empty-state count when totalRounds=0', () => {
    render(<Marquee phase="recruiting" round={0} totalRounds={0} sidebarText="" />);
    expect(screen.getByText('round — of —')).toBeInTheDocument();
  });

  it('renders green LED + ceremony-live when phase=ceremony-live', () => {
    render(
      <Marquee
        phase="ceremony-live"
        round={3}
        totalRounds={10}
        sidebarText=""
      />,
    );
    const led = screen.getByLabelText('phase: ceremony-live');
    expect(led.getAttribute('data-led-color')).toBe('green');
    expect(screen.getByText(/round 3 of 10/i)).toBeInTheDocument();
  });

  it('renders blue LED + live label when phase=live', () => {
    render(<Marquee phase="live" round={10} totalRounds={10} sidebarText="" />);
    const led = screen.getByLabelText('phase: live');
    expect(led.getAttribute('data-led-color')).toBe('blue');
  });

  it('renders sidebar text when provided', () => {
    render(
      <Marquee
        phase="recruiting"
        round={0}
        totalRounds={10}
        sidebarText="awaiting first contributor (10 needed · ≥32 GB RAM or cloud equivalent)"
      />,
    );
    expect(screen.getByText(/awaiting first contributor/i)).toBeInTheDocument();
  });
});
