// PathCards — /ceremony left-column.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 4.
// All copy strings are FROZEN per plan §0.1 (marketer-locked); do not
// rephrase without surfacing to the lead.
//
// `collapseToCoord` is the status-feed-down fallback per spec §4.5: hide the
// path cards (which require live status to be relevant) but keep the COORD
// attribution so contributors still know who to DM.

interface PathCardsProps {
  readonly collapseToCoord?: boolean;
}

export function PathCards({ collapseToCoord = false }: PathCardsProps) {
  return (
    <aside
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 'var(--ct-fs)',
        color: 'var(--ct-ink)',
      }}
    >
      {!collapseToCoord && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ct-gap)',
          }}
        >
          <li className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
            <span className="ct-tag">LOCAL</span> ─→ ≥32 GB RAM · ~20 min · $0
          </li>
          <li className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
            <a
              className="ct-tag"
              href="https://github.com/alik-eth/zkqes/blob/main/scripts/ceremony-coord/cookbooks/fly/README.md"
            >
              CLOUD
            </a>{' '}
            ─→ Fly.io · ~20 min · ~$0.30
          </li>
          <li className="ct-panel" style={{ padding: 'var(--ct-pad)' }}>
            <a className="ct-tag" href="/#help-with-the-ceremony">
              HETZNER
            </a>{' '}
            ─→ CCX33 · self-driven · see README
          </li>
        </ul>
      )}
      <div
        style={{
          marginTop: '24px',
          borderTop: '1px solid var(--ct-rule-soft)',
          paddingTop: '12px',
        }}
      >
        COORD: alik.eth · DM for round assignment
      </div>
    </aside>
  );
}
