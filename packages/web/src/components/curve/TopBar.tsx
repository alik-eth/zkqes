// Shared Curve-2021 TopBar — used by every redesigned surface.
//
// Variants are driven by props rather than per-page copies:
// `active` highlights the current nav cell; `statusPill` slots a
// custom right-of-version pill (wallet status, phase, registry…);
// `extraNav` lets app-target surfaces inject Register/Account links.

import { Link } from '@tanstack/react-router';
import '../../styles/curve.css';

export type TopBarSlot = 'home' | 'about' | 'ceremony' | 'verify' | 'integrations' | 'qtsp' | string;

export interface TopBarProps {
  readonly active: TopBarSlot;
  readonly statusPill?: React.ReactNode;
  readonly extraNav?: React.ReactNode;
}

export function TopBar({ active, statusPill, extraNav }: TopBarProps) {
  const baseStyle: React.CSSProperties = {
    padding: '4px 10px', border: '2px solid transparent',
    color: '#f4f0e0', fontWeight: 500, fontSize: 13, textDecoration: 'none',
  };
  const activeStyle: React.CSSProperties = {
    ...baseStyle, background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)', fontWeight: 700,
  };
  const navItem = (slot: TopBarSlot) => slot === active ? activeStyle : baseStyle;

  return (
    <div className="cv-topbar" style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px',
      background: 'var(--cv-ink)', color: '#f4f0e0', borderBottom: '4px solid var(--cv-ua-yellow)',
    }}>
      <span className="cv-topbar-brand" style={{ fontFamily: 'var(--cv-display)', fontSize: 30, letterSpacing: '.04em', color: 'var(--cv-ua-yellow)' }}>zkQES</span>
      <span className="cv-pill is-ua cv-hide-mobile">v0 · BASE-SEPOLIA</span>
      <span className="cv-hide-mobile">{statusPill}</span>
      <span className="cv-topbar-spacer" style={{ flex: 1 }} />
      <Link to="/" style={navItem('home')}>Home</Link>
      <Link to="/about" style={navItem('about')}>About</Link>
      <Link to="/ceremony" style={navItem('ceremony')}>Ceremony</Link>
      <Link to="/verify" style={navItem('verify')}>Verify</Link>
      {extraNav}
      <a
        href="https://t.me/zkqes"
        target="_blank"
        rel="noopener noreferrer"
        className="cv-btn is-sm"
        style={{ marginLeft: 8, background: '#229ED9', color: '#fff' }}
      >
        ✈ Telegram
      </a>
      <span className="cv-cta-wrap" data-desktop-only data-variant="sm">
        <a href="https://app.zkqes.org" className="cv-btn is-sm">▶ Open app</a>
      </span>
    </div>
  );
}

