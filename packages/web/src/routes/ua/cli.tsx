// `/ua/cli` — V5.4 install instructions for the zkqes CLI server.
//
// V5.2 makes the browser canonical; the CLI is OPTIONAL
// and used only as a faster prove path. From this page, users learn
// how to install + run `zkqes serve`, then go back to /v5/registerV5
// where useCliPresence detects the running server and the prove
// pipeline branches to it (with browser fallback).
//
// V1 ships **npm-only** (npm install -g @zkqes/cli) per circuits-eng's
// packaging path. brew + GitHub release single-file binaries are
// deferred to V1.1 — sections below say so explicitly so users on
// brew/winget aren't left wondering when their channel will work.
//
// Aesthetic: civic-terminal v2 (task #84), matches /ceremony/contribute —
// .ct page chrome, .ct-divider section rules, dot-marker list items in
// --ct-mute, CopyButton on every code block, VT323 display + IBM Plex
// Mono body via the civic-terminal token set.
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '../../components/CopyButton';
import { DocumentFooter } from '../../components/DocumentFooter';
import '../../styles/civic-terminal.css';

export function CliInstall() {
  const { t } = useTranslation();

  // V1 ships npm-only per circuits-eng's packaging path:
  //   - bun ↔ snarkjs has an EventTarget panic that blocks pkg-style
  //     single-file binary builds.
  //   - Homebrew + GitHub release binaries deferred to V1.1.
  // Lead's framing 2026-05-03: "Honest scope is better than ambitious-
  // but-empty install instructions." So we show ONE working command
  // (npm) + a single deferred-channels note rather than three code
  // blocks where two literally don't run in V1.
  const NPM_INSTALL = 'npm install -g @zkqes/cli';

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
          padding: '96px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
        }}
      >
        <Link to="/" className="ct-link" style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
          ← {t('cli.back', 'back to home')}
        </Link>

        <header>
          <h1
            style={{
              fontFamily: 'var(--display)',
              fontSize: '52px',
              lineHeight: 1,
              margin: 0,
              marginBottom: '24px',
              color: 'var(--ct-ink)',
            }}
          >
            {t('cli.title', 'Install zkqes CLI for native proof generation.')}
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '15px', lineHeight: 1.5, maxWidth: '60ch', color: 'var(--ct-ink)' }}>
              {t(
                'cli.lede',
                'Optional. The browser prover works as-is. Install the CLI to make proof generation about 7× faster and 10× lighter on memory.',
              )}
            </p>
          </header>

          <hr className="ct-divider" />

          <section
            aria-labelledby="why-heading"
            data-testid="cli-why"
            className="space-y-6"
          >
            <h2
              id="why-heading"
              className="text-3xl"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('cli.whyHeading', 'Why install it')}
            </h2>
            <ul className="space-y-3 text-base" style={{ color: 'var(--ct-ink)' }}>
              <li>
                <span style={{ color: 'var(--ct-mute)', marginRight: '0.5em' }}>·</span>
                <strong>{t('cli.whyFasterTitle', '~7× faster.')}</strong>{' '}
                {t(
                  'cli.whyFaster',
                  'About 14 s native rapidsnark vs ~90 s in-browser snarkjs on the same machine.',
                )}
              </li>
              <li>
                <span style={{ color: 'var(--ct-mute)', marginRight: '0.5em' }}>·</span>
                <strong>{t('cli.whyLighterTitle', '~10× less memory.')}</strong>{' '}
                {t(
                  'cli.whyLighter',
                  '≈3.7 GB peak native vs ≈38 GB in-browser. Phones / low-RAM laptops can finally generate proofs.',
                )}
              </li>
              <li>
                <span style={{ color: 'var(--ct-mute)', marginRight: '0.5em' }}>·</span>
                <strong>{t('cli.whyOnlyOnInvokeTitle', 'Runs only when invoked.')}</strong>{' '}
                {t(
                  'cli.whyOnlyOnInvoke',
                  "Not a daemon. You start it with `zkqes serve`, leave it running while you generate proofs, then Ctrl+C when done.",
                )}
              </li>
              <li>
                <span style={{ color: 'var(--ct-mute)', marginRight: '0.5em' }}>·</span>
                <strong>{t('cli.whyPrivateTitle', 'Keys never leave your machine.')}</strong>{' '}
                {t(
                  'cli.whyPrivate',
                  'The CLI binds to localhost:9080. The browser fetches it via the same-origin pin (https://app.zkqes.org); no other origin can talk to it.',
                )}
              </li>
            </ul>
          </section>

          <hr className="ct-divider" />

          <section
            aria-labelledby="install-heading"
            data-testid="cli-install"
            className="space-y-6"
          >
            <h2
              id="install-heading"
              className="text-3xl"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('cli.installHeading', 'Install')}
            </h2>
            <p className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
              {t(
                'cli.installLede',
                'V1 ships via npm. Requires Node 20 or newer; works on macOS, Linux, and Windows + WSL.',
              )}
            </p>
            <pre
              className="text-mono text-sm p-4 overflow-x-auto whitespace-pre-wrap break-all"
              data-testid="cli-cmd-npm"
              style={{ background: 'var(--ct-ink)', color: 'var(--hilite-text)' }}
            >
{NPM_INSTALL}
            </pre>
            <div>
              <CopyButton text={NPM_INSTALL} testId="cli-copy-npm" />
            </div>
            <p className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
              {t(
                'cli.installNpmNote',
                'Postinstall downloads the rapidsnark sidecar matching your OS + arch (~12 MB). The CLI itself is a ~32 KB tarball.',
              )}
            </p>
            {/* Windows callout — iden3 rapidsnark v0.0.8 ships no Windows
                prebuilt, so postinstall can't fetch a sidecar. Windows
                users must point the CLI at their own rapidsnark binary
                via --rapidsnark-bin <path>. WSL users can install
                rapidsnark inside the WSL distro normally. Per
                circuits-eng's T8 scope cut. */}
            <aside
              className="p-4 space-y-2 border"
              style={{ borderColor: 'var(--ct-mute)', color: 'var(--ct-ink)' }}
              data-testid="cli-windows-callout"
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--ct-mute)' }}>
                {t('cli.windowsCalloutLabel', 'Windows note')}
              </p>
              <p className="text-sm">
                {t(
                  'cli.windowsCalloutBody',
                  'rapidsnark has no Windows prebuilt in V1. Native Windows users must build rapidsnark themselves and pass `qkb serve --rapidsnark-bin C:\\\\path\\\\to\\\\rapidsnark.exe`. WSL users install rapidsnark inside the WSL distro normally — no extra flag needed.',
                )}
              </p>
            </aside>
            <p
              className="text-sm"
              style={{ color: 'var(--ct-ink)', opacity: 0.7 }}
              data-testid="cli-deferred-channels"
            >
              {t(
                'cli.deferredChannels',
                'Homebrew formula (`brew install alik-eth/homebrew-zkqes/zkqes`) and a one-line curl installer are coming in V1.1. For V1, npm is the supported channel.',
              )}
            </p>
          </section>

          <hr className="ct-divider" />

          <section
            aria-labelledby="run-heading"
            data-testid="cli-run"
            className="space-y-6"
          >
            <h2
              id="run-heading"
              className="text-3xl"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('cli.runHeading', 'Run it')}
            </h2>
            <p className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
              {t(
                'cli.runBody',
                'Open a terminal and start the server. Leave it running while you generate proofs — it binds to localhost:9080 and accepts /prove POSTs from https://app.zkqes.org only.',
              )}
            </p>
            <pre
              className="text-mono text-sm p-4 overflow-x-auto"
              data-testid="cli-cmd-serve"
              style={{ background: 'var(--ct-ink)', color: 'var(--hilite-text)' }}
            >
zkqes serve
            </pre>
            <div>
              <CopyButton text="zkqes serve" testId="cli-copy-serve" />
            </div>
            <p className="text-sm" style={{ color: 'var(--ct-ink)', opacity: 0.7 }}>
              {t(
                'cli.runStop',
                'Stop with Ctrl+C when finished. The server does not auto-start; nothing runs in the background.',
              )}
            </p>
          </section>

          <hr className="ct-divider" />

          <section
            aria-labelledby="verify-heading"
            data-testid="cli-verify"
            className="space-y-6"
          >
            <h2
              id="verify-heading"
              className="text-3xl"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('cli.verifyHeading', 'Verify it')}
            </h2>
            <p className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
              {t(
                'cli.verifyBody',
                'With zkqes serve running, go back to the register flow. The "Install zkqes" banner disappears when the browser detects the running server, and your prove step shows "proved via: cli" instead of "browser".',
              )}
            </p>
            <Link
              to="/"
              className="inline-block text-lg"
              style={{ color: 'var(--ua-blue)' }}
              data-testid="cli-back-to-register"
            >
              {t('cli.verifyCta', 'Back to the register flow →')}
            </Link>
          </section>

          <hr className="ct-divider" />

          <section
            aria-labelledby="troubleshoot-heading"
            data-testid="cli-troubleshoot"
            className="space-y-6"
          >
            <h2
              id="troubleshoot-heading"
              className="text-3xl"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('cli.troubleshootHeading', 'Troubleshooting')}
            </h2>
            <dl className="space-y-6">
              <div>
                <dt
                  className="text-sm mb-1"
                  style={{
                    color: 'var(--ua-blue)',
                    fontVariant: 'small-caps',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('cli.troublePortLabel', 'Port 9080 already in use')}
                </dt>
                <dd className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
                  {t(
                    'cli.troublePortBody',
                    'Another process is bound to :9080. Either stop it (`lsof -i :9080`, then kill the PID) or pass `zkqes serve --port <other>`. The browser only auto-detects :9080 in V1; alternate ports work but the banner won\'t auto-disappear.',
                  )}
                </dd>
              </div>
              <div>
                <dt
                  className="text-sm mb-1"
                  style={{
                    color: 'var(--ua-blue)',
                    fontVariant: 'small-caps',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('cli.troubleSidecarLabel', 'rapidsnark sidecar missing')}
                </dt>
                <dd className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
                  {t(
                    'cli.troubleSidecarBody',
                    'If postinstall couldn\'t download the sidecar (offline machine, restricted CI, or native Windows where iden3 v0.0.8 ships no prebuilt), pass `zkqes serve --rapidsnark-bin <path>` with a binary you built yourself. Run `zkqes cache rebuild` while online to retry the postinstall download on platforms that have a prebuilt.',
                  )}
                </dd>
              </div>
              <div>
                <dt
                  className="text-sm mb-1"
                  style={{
                    color: 'var(--ua-blue)',
                    fontVariant: 'small-caps',
                    letterSpacing: '0.08em',
                  }}
                >
                  {t('cli.troubleManifestLabel', 'Manifest fetch fails')}
                </dt>
                <dd className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
                  {t(
                    'cli.troubleManifestBody',
                    'On first run the CLI fetches the V5.2 zkey manifest from zkqes.org. If your network blocks it, pass `--manifest-url file:///path/to/local-manifest.json` with a vendored copy. The CLI verifies the manifest signature against the embedded public key in either case.',
                  )}
                </dd>
              </div>
            </dl>
        </section>
      </div>
      <DocumentFooter />
    </main>
  );
}
