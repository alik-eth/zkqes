// Civic-terminal v2 surface (BRAND.md §Surface grammar). Pre-v2
// .doc-grid retired in favor of .ct page chrome (task #84).
//
// V5 mint route — post-register page reached after a successful
// registerV5 transaction. Also addressable directly: a registered
// user can revisit `/ua/mintNft` later to mint at their leisure
// (mintDeadline allowing).
import { Link } from '@tanstack/react-router';
import { DocumentFooter } from '../../components/DocumentFooter';
import { MintNftStep } from '../../components/ua/v5/MintNftStep';
import '../../styles/civic-terminal.css';

export function MintNftScreen() {
  return (
    <main
      className="ct"
      style={{
        minHeight: '100vh',
        background: 'var(--ct-paper)',
        color: 'var(--ct-ink)',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '48px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <Link
          to="/"
          className="ct-link"
          style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}
        >
          ← back
        </Link>
        <MintNftStep />
      </div>
      <DocumentFooter />
    </main>
  );
}
