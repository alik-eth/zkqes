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
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px',
      background: 'var(--cv-ink)', color: '#f4f0e0', borderBottom: '4px solid var(--cv-ua-yellow)',
    }}>
      <FlagUA /><FlagEU />
      <span style={{ fontFamily: 'var(--cv-display)', fontSize: 30, letterSpacing: '.04em', color: 'var(--cv-ua-yellow)' }}>zkQES</span>
      <span className="cv-pill is-ua">v0 · BASE-SEPOLIA</span>
      {statusPill}
      <span style={{ flex: 1 }} />
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
      <a href="https://app.zkqes.org" className="cv-btn is-sm">▶ Open app</a>
    </div>
  );
}

function FlagUA() {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', width: 28, height: 18, border: '1.5px solid #f4f0e0' }}>
      <span style={{ flex: 1, background: '#0057B7' }} />
      <span style={{ flex: 1, background: '#FFD700' }} />
    </span>
  );
}
function FlagEU() {
  return (
    <span style={{
      display: 'inline-flex', width: 28, height: 18, background: '#003399',
      border: '1.5px solid #f4f0e0', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#FFCC00', fontSize: 11, lineHeight: 1 }}>★</span>
    </span>
  );
}
