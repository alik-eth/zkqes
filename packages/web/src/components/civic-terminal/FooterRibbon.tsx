// FooterRibbon — every-surface civic-terminal chrome.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 2.
// BRAND.md v2-amendment §Footer ribbon: `{BUILD_SHA_7} · {BUILD_DATE} · zkqes.org`.
//
// `buildSha` is sliced to 7 chars (git short-SHA convention) and `buildDate`
// is whatever the build pipeline injects via `VITE_BUILD_SHA` / `VITE_BUILD_DATE`.

interface FooterRibbonProps {
  readonly buildSha: string;
  readonly buildDate: string;
}

export function FooterRibbon({ buildSha, buildDate }: FooterRibbonProps) {
  const sha7 = buildSha.slice(0, 7);
  return (
    <footer
      className="ct-panel"
      role="contentinfo"
      style={{
        marginTop: 'auto',
        padding: '8px var(--ct-pad)',
        fontFamily: 'var(--mono)',
        fontSize: '11px',
        color: 'var(--ct-mute)',
        textAlign: 'center',
      }}
    >
      {sha7} · {buildDate} · zkqes.org
    </footer>
  );
}
