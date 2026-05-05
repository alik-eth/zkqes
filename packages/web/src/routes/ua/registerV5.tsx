// /ua/registerV5 — UA holder registration entry point.
//
// V3 surface (Task #87 fifth landing, 2026-05-05): civic-terminal v3
// "RegisterC_Document" chrome wraps the existing Step1–4 register
// state machine per founder pick from the Claude Design handoff
// bundle (`/tmp/zkqes-design/zk-qes-3/`). Wireframe source:
// `register-variants.jsx::RegisterC_Document` (lines 121–346).
//
// Layout: notarised-filing document with five numbered Articles
// (Declarant, Wallet hereby bound, QTSP, Statement of binding,
// Execution), 3-column body (article rail + document text +
// marginalia), letterhead + page footer with action row. The
// chrome is composition only — Step1–4 components render INSIDE
// the relevant Articles; their internals + V5.1 walletSecret
// derivation + V5.2 22-field public-signal layout + V5.3 OID-anchor
// witness emission are PRESERVED VERBATIM per packages/web/CLAUDE.md
// invariants #9, #14, #15, #20. Precedent: Rotate B at 2031a0c
// ("the shell is composition only").
//
// Article-to-step mapping (also explained in the commit message):
//   Art. 1 — Declarant: redacted-name strip, statically rendered
//     as visual chrome. The cert isn't parsed until Step 3 emits
//     a .p7s; pre-parse the strip renders an "awaiting QES upload"
//     state. The wireframe's "Read locally from the QES certificate.
//     Never transmitted, never proven onchain." annotation captures
//     the protocol invariant correctly: names ARE never proven on
//     chain (V5.2 public-signal layout has no name field). We DO
//     NOT add a new name-reading code path here — that would cross
//     the chrome boundary and risk drift from the Step3 cert path.
//   Art. 2 — Wallet hereby bound: Step1ConnectWallet renders
//     inside; the WALLET / NETWORK / CHAIN ID display reads live
//     `useAccount().address` + `useChainId()`. Invariant #10
//     (newWalletAddress LOCKED) is rotate-only and does NOT apply
//     here.
//   Art. 3 — Qualified Trust Service Provider: pure statute text
//     (Recital), with the QtspScope T13 search-param banner
//     ("?qtsp=<cc>/<slug>") rendered above. Step2GenerateBinding
//     and Step3DiiaSign render inside so the user produces the
//     binding + Diia .p7s within this Article. The "QTSP /
//     — withheld by zero-knowledge —" panel is informational
//     (the proof asserts membership only; the QTSP identity is
//     not disclosed on-chain).
//   Art. 4 — Statement of binding: pure statute (Recital), no
//     live data.
//   Art. 5 — Execution: dual signature block (QES on the left
//     showing Diia .p7s upload status, wallet counter-signature
//     on the right showing connected-wallet status) above
//     Step4ProveAndRegister. Step4's existing CTAs render inside.
//
// Marginalia rail: NOTARY + ANNOTATION × 2 + FILE STATE. The FILE
// STATE per-article tags are driven by the live `step` machine
// state, not the wireframe's hardcoded complete/pending/read
// /awaiting-sig strings.
//
// V2 atomic flip (Task 13, 2026-05-04): the legacy civic-monumental
// `RegisterV5Legacy` body + `?variant=civic-terminal` URL gate were
// deleted. The legacy `assessDeviceCapability` flow stays exported
// from lib/deviceGate.ts for any non-v3 consumer that hasn't migrated.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { useAccount, useChainId } from 'wagmi';
import { Step1ConnectWallet } from '../../components/ua/v5/Step1ConnectWallet';
import { Step2GenerateBinding } from '../../components/ua/v5/Step2GenerateBinding';
import { Step3DiiaSign } from '../../components/ua/v5/Step3DiiaSign';
import { Step4ProveAndRegister } from '../../components/ua/v5/Step4ProveAndRegister';
import { DeviceReadinessGate } from '../../components/app/DeviceReadinessGate';
import { PreviewModeBanner } from '../../components/app/PreviewModeBanner';
import { TestnetBanner } from '../../components/app/TestnetBanner';
import { FooterRibbon } from '../../components/civic-terminal/FooterRibbon';
import { QTSP_INDEX } from '../../generated/qtsp-index';
import { QtspScopeContext, resolveQtspScope } from '../../lib/qtspScope';

type StepNumber = 1 | 2 | 3 | 4;

const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';
const BUILD_DATE =
  (import.meta.env.VITE_BUILD_DATE as string | undefined) ??
  new Date().toISOString().slice(0, 10);

// Stable form-id constants. The wireframe's "REV. 04" is a stable
// form-revision tag; we surface it as a constant rather than hardcoding
// a per-render mock string.
const FORM_ID = 'FORM ZK-QES / 01';
const FORM_REV = 'REV. 04';

// FILE STATE per-article tag kinds, driven by live step machine state.
// Article numbers map to step machine stages:
//   Art. 1 (Declarant) — visual; "complete" once a .p7s has been
//     uploaded (i.e. step >= 3+ with p7s set), else "awaiting".
//   Art. 2 (Wallet) — "complete" once the wallet is connected
//     (step >= 2 in the post-connect machine), else "pending".
//   Art. 3 (QTSP) — "complete" once binding + .p7s emitted
//     (step >= 4), "pending" while the user is on step 2 or 3.
//   Art. 4 (Statement) — "read" — pure statute; always rendered.
//   Art. 5 (Execution) — "complete" if step === 4 and we've moved
//     past prove-and-register; otherwise "awaiting sig".
type ArticleState = 'complete' | 'pending' | 'read' | 'awaiting';

function FlagUA() {
  return (
    <div className="ct-flag-ua" title="Україна">
      <i /><i />
    </div>
  );
}

function FlagEU() {
  return <div className="ct-flag-eu" title="EU">★</div>;
}

function shortAddr(addr: string | undefined): string {
  if (!addr) return '';
  // 0x12 34 … 56 78 — wireframe-style hex grouping. Render the
  // first 6 + last 4 (familiar Etherscan grouping) with a non-
  // breaking ellipsis between.
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function chainName(chainId: number | undefined): string {
  // Live chain → human label. Live chain id is the source of truth;
  // we never ship a hardcoded "BASE · L2" / "8453" string the way
  // the wireframe did.
  if (!chainId) return '—';
  switch (chainId) {
    case 1: return 'ETH MAINNET';
    case 8453: return 'BASE · L2';
    case 84532: return 'BASE SEPOLIA · L2 TESTNET';
    case 11155111: return 'SEPOLIA · TESTNET';
    case 31337: return 'LOCAL · ANVIL';
    default: return `CHAIN ${chainId}`;
  }
}

export interface RegisterV5ScreenProps {
  /**
   * Optional search-params bag. The route wrapper passes
   * `useSearch({ strict: false })`; tests + standalone callers can
   * pass a literal `{ qtsp?: string }`. Multi-QTSP facade T13:
   * `qtsp` is a `<cc>/<slug>` path against `QTSP_INDEX`; on resolve
   * the meta scopes the register-flow surface (signing-tool prompt,
   * `cert.berInput` error templates). On miss / malformed / bronze
   * the scope falls back to UA-default (null context) per spec §4.4.
   */
  searchParams?: { qtsp?: string };
}

export function RegisterV5Screen({ searchParams }: RegisterV5ScreenProps = {}) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<StepNumber>(1);
  const [bindingBytes, setBindingBytes] = useState<Uint8Array | null>(null);
  const [p7s, setP7s] = useState<Uint8Array | null>(null);
  const qtspScope = useMemo(
    () => resolveQtspScope(searchParams?.qtsp, QTSP_INDEX),
    [searchParams?.qtsp],
  );

  // Live wallet + chain — the Article 2 panel surfaces these.
  // Reading useAccount/useChainId here is invariant-safe: invariant
  // #10 (newWalletAddress LOCKED) is rotate-only.
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Per-article live status tags for the FILE STATE marginalia.
  const articleStates: Record<1 | 2 | 3 | 4 | 5, ArticleState> = {
    1: p7s ? 'complete' : 'awaiting',
    2: isConnected ? 'complete' : 'pending',
    3: p7s ? 'complete' : (bindingBytes ? 'pending' : 'awaiting'),
    4: 'read',
    5: step === 4 ? 'pending' : 'awaiting',
  };

  // Form-letterhead live timestamp — wireframe shipped "2026-05-04 ·
  // 14:08 EET" hardcoded; substitute the live local time formatted
  // as YYYY-MM-DD · HH:MM with the user's timezone abbreviation
  // (best-effort; falls back to ISO date alone).
  const draftStamp = useMemo(() => {
    const d = new Date();
    const date = d.toISOString().slice(0, 10);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    let tz = '';
    try {
      tz = d.toLocaleTimeString(i18n.language, { timeZoneName: 'short' })
        .split(' ').pop() ?? '';
    } catch {
      tz = '';
    }
    return `${date} · ${hh}:${mm}${tz ? ` ${tz}` : ''}`;
    // i18n.language only changes on locale switch; safe to depend on it.
  }, [i18n.language]);

  // Total of completed articles for the footer counter — drives the
  // wireframe's "3 of 5 articles complete" string with a live count.
  const completeCount = (Object.values(articleStates) as ArticleState[])
    .filter((s) => s === 'complete' || s === 'read').length;

  return (
    <QtspScopeContext.Provider value={qtspScope}>
    <main
      className="ct ct-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ct-paper)',
      }}
      data-testid="register-v3-shell"
    >
      <TestnetBanner />
      <PreviewModeBanner />

      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '24px',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <div
          className="ct-panel"
          style={{ padding: 0, background: 'var(--ct-paper-2)' }}
          data-testid="register-v3-document"
        >
          {/* Letterhead */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              gap: 14,
              padding: '10px 18px',
              borderBottom: '1.5px solid var(--ct-ink)',
              background: 'var(--ct-paper)',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <FlagUA />
              <FlagEU />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: 22,
                  lineHeight: 1,
                  letterSpacing: '.06em',
                }}
              >
                {t('registerV5.v3.letterhead.office')}
              </div>
              <div className="ct-cert-no">
                {FORM_ID} · {t('registerV5.v3.letterhead.formTitle')} · {FORM_REV}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="ct-cert-no">{t('registerV5.v3.letterhead.draft')}</div>
              <div className="ct-cert-no">{draftStamp}</div>
            </div>
          </div>

          {/* QTSP scope banner — T13 wiring preserved verbatim */}
          {qtspScope && (
            <div
              data-testid="qtsp-scope-banner"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 13,
                color: 'var(--ct-mute)',
                padding: '6px 18px',
                borderBottom: '1px dashed var(--ct-rule)',
                background: 'var(--ct-paper)',
              }}
            >
              {qtspScope.displayName} · {qtspScope.signingTool.name}
            </div>
          )}

          {/* Body — 3 columns: article rail · text · marginalia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 240px', gap: 0 }}>
            {/* Article rail (visual separator) */}
            <div
              style={{ padding: '0 18px', borderRight: '1px solid var(--ct-ink)' }}
              aria-hidden="true"
            >
              <div style={{ height: 8 }} />
            </div>

            {/* Document text */}
            <div style={{ padding: '10px 22px 16px' }}>
              <DeviceReadinessGate>
                <Article n={1} title={t('registerV5.v3.art1.title')}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      {t('registerV5.v3.art1.body')}
                    </div>
                    <Tag kind={p7s ? 'ok' : undefined}>
                      {p7s
                        ? t('registerV5.v3.art1.tagVerified')
                        : t('registerV5.v3.art1.tagAwaiting')}
                    </Tag>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      margin: '8px 0 4px',
                    }}
                  >
                    <span className="ct-cert-no" style={{ width: 64 }}>
                      {t('registerV5.v3.art1.nameLabel')}
                    </span>
                    {p7s ? (
                      <div
                        aria-label={t('registerV5.v3.art1.redactedAria')}
                        style={{
                          flex: 1,
                          height: 30,
                          padding: '4px 10px',
                          border: '1.5px solid var(--ct-ink)',
                          background:
                            'repeating-linear-gradient(90deg, #1a1a1a 0 6px, #2a2a2a 6px 12px)',
                          color: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          fontFamily: 'var(--mono)',
                          fontSize: 14,
                          letterSpacing: '.4em',
                        }}
                      >
                        ████████ ████████████
                      </div>
                    ) : (
                      <span
                        className="ct-input ct-input--paper"
                        style={{
                          flex: 1,
                          padding: '4px 10px',
                          color: 'var(--ct-mute)',
                          fontStyle: 'italic',
                        }}
                      >
                        {t('registerV5.v3.art1.nameAwaiting')}
                      </span>
                    )}
                    <Tag>{t('registerV5.v3.art1.tagRedacted')}</Tag>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ct-mute)' }}>
                    {t('registerV5.v3.art1.annotation')}
                  </div>
                </Article>

                <Article n={2} title={t('registerV5.v3.art2.title')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="ct-cert-no" style={{ width: 64 }}>
                      {t('registerV5.v3.art2.walletLabel')}
                    </span>
                    <span
                      className="ct-input"
                      data-testid="register-v3-wallet"
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: 14,
                        color: isConnected ? 'var(--ct-ink)' : 'var(--ct-mute)',
                        fontStyle: isConnected ? 'normal' : 'italic',
                      }}
                    >
                      {isConnected
                        ? shortAddr(address)
                        : t('registerV5.v3.art2.walletAwaiting')}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 8,
                    }}
                  >
                    <span className="ct-cert-no" style={{ width: 64 }}>
                      {t('registerV5.v3.art2.networkLabel')}
                    </span>
                    <span
                      className="ct-input ct-input--paper"
                      style={{ width: 220, padding: '4px 10px', textAlign: 'center' }}
                    >
                      {chainName(chainId)}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span className="ct-cert-no">
                      {t('registerV5.v3.art2.chainIdLabel')} {chainId ?? '—'}
                    </span>
                  </div>
                  {/* Step 1 (connect-wallet UI) lives inside Article 2 — its
                      onAdvance is the gate from "wallet pending" → "binding
                      generation". On step >= 2 the connect UI is satisfied
                      and we hide it; the connected-wallet display above
                      stays visible. */}
                  {step === 1 && (
                    <div style={{ marginTop: 14 }}>
                      <Step1ConnectWallet onAdvance={() => setStep(2)} />
                    </div>
                  )}
                </Article>

                <Article n={3} title={t('registerV5.v3.art3.title')}>
                  <Recital
                    start={1}
                    lines={[
                      t('registerV5.v3.art3.recital1'),
                      t('registerV5.v3.art3.recital2'),
                    ]}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <span className="ct-cert-no" style={{ width: 64 }}>
                      {t('registerV5.v3.art3.qtspLabel')}
                    </span>
                    <span
                      className="ct-input ct-input--paper"
                      style={{ flex: 1, padding: '4px 10px', color: 'var(--ct-mute)' }}
                    >
                      {qtspScope
                        ? `${qtspScope.displayName} · ${qtspScope.signingTool.name}`
                        : t('registerV5.v3.art3.qtspWithheld')}
                    </span>
                  </div>
                  {/* Step 2 (binding generation) and Step 3 (.p7s upload)
                      live inside Article 3 — together they are the QTSP
                      interaction (binding bytes + Diia signature). */}
                  {step === 2 && (
                    <div style={{ marginTop: 14 }}>
                      <Step2GenerateBinding
                        onAdvance={(bytes) => {
                          setBindingBytes(bytes);
                          setStep(3);
                        }}
                        onBack={() => setStep(1)}
                      />
                    </div>
                  )}
                  {step === 3 && (
                    <div style={{ marginTop: 14 }}>
                      <Step3DiiaSign
                        onP7s={(bytes) => {
                          setP7s(bytes);
                          setStep(4);
                        }}
                        onBack={() => setStep(2)}
                      />
                    </div>
                  )}
                </Article>

                <Article n={4} title={t('registerV5.v3.art4.title')}>
                  <Recital
                    start={3}
                    lines={[
                      t('registerV5.v3.art4.recital1'),
                      t('registerV5.v3.art4.recital2'),
                      t('registerV5.v3.art4.recital3'),
                      t('registerV5.v3.art4.recital4'),
                    ]}
                  />
                </Article>

                <Article n={5} title={t('registerV5.v3.art5.title')}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 32px 1fr',
                      alignItems: 'stretch',
                      gap: 18,
                      marginTop: 6,
                    }}
                  >
                    {/* QES signature block (left) */}
                    <SignatureBlock
                      legend={t('registerV5.v3.art5.qesLegend')}
                      bottomLeft={t('registerV5.v3.art5.qesProtocol')}
                      bottomRight={
                        p7s
                          ? t('registerV5.v3.art5.qesUploaded')
                          : t('registerV5.v3.art5.qesAwaiting')
                      }
                      bottomRightOk={Boolean(p7s)}
                    >
                      {p7s ? (
                        <div
                          style={{
                            fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive",
                            fontSize: 26,
                            letterSpacing: '.02em',
                            color: 'transparent',
                            background:
                              'repeating-linear-gradient(90deg, var(--ct-ink) 0 4px, transparent 4px 8px)',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            opacity: 0.55,
                            userSelect: 'none',
                          }}
                          aria-label={t('registerV5.v3.art5.qesSigAria')}
                        >
                          ░░░░░░░░░░░░░
                        </div>
                      ) : (
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: 'var(--ct-mute)',
                            fontStyle: 'italic',
                          }}
                        >
                          {t('registerV5.v3.art5.qesPlaceholder')}
                        </span>
                      )}
                    </SignatureBlock>

                    {/* Stamp / seal */}
                    <div style={{ display: 'grid', placeItems: 'center' }}>
                      <Seal />
                    </div>

                    {/* Wallet counter-signature (right) */}
                    <SignatureBlock
                      legend={t('registerV5.v3.art5.walletLegend')}
                      bottomLeft={t('registerV5.v3.art5.walletProtocol')}
                      bottomRight={
                        isConnected
                          ? t('registerV5.v3.art5.walletReady')
                          : t('registerV5.v3.art5.walletAwaiting')
                      }
                      bottomRightOk={isConnected}
                    >
                      {isConnected ? (
                        <div
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 13,
                            color: 'var(--ok)',
                          }}
                        >
                          {shortAddr(address)} · {t('registerV5.v3.art5.walletAuto')}
                        </div>
                      ) : (
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: 'var(--ct-mute)',
                            fontStyle: 'italic',
                          }}
                        >
                          {t('registerV5.v3.art5.walletPlaceholder')}
                        </span>
                      )}
                    </SignatureBlock>
                  </div>

                  {/* Step 4 (prove + register) renders inside the Execution
                      Article — its CTA is the on-chain submission gate. */}
                  {step === 4 && p7s && bindingBytes && (
                    <div style={{ marginTop: 16 }}>
                      <Step4ProveAndRegister
                        p7s={p7s}
                        bindingBytes={bindingBytes}
                        onBack={() => setStep(3)}
                      />
                    </div>
                  )}
                </Article>
              </DeviceReadinessGate>
            </div>

            {/* Marginalia / annotations */}
            <div
              style={{
                padding: '14px 14px 14px 0',
                borderLeft: '1px dashed var(--ct-rule)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
              data-testid="register-v3-marginalia"
            >
              <div className="ct-field">
                <span className="ct-legend">{t('registerV5.v3.marginalia.notaryLegend')}</span>
                <div style={{ fontSize: 11.5 }}>
                  {t('registerV5.v3.marginalia.notaryBody')}
                </div>
              </div>
              <div className="ct-field">
                <span className="ct-legend">{t('registerV5.v3.marginalia.annotation1Legend')}</span>
                <div style={{ fontSize: 11.5 }}>
                  {t('registerV5.v3.marginalia.annotation1Body')}
                </div>
              </div>
              <div className="ct-field">
                <span className="ct-legend">{t('registerV5.v3.marginalia.annotation4Legend')}</span>
                <div style={{ fontSize: 11.5 }}>
                  {t('registerV5.v3.marginalia.annotation4Body')}
                </div>
              </div>
              <div className="ct-field">
                <span className="ct-legend">{t('registerV5.v3.marginalia.fileStateLegend')}</span>
                <div className="ct-stack" style={{ gap: 4, fontSize: 11.5 }}>
                  {([1, 2, 3, 4, 5] as const).map((n) => (
                    <div key={n} className="ct-row-h">
                      <span style={{ flex: 1 }}>
                        {t('registerV5.v3.marginalia.articlePrefix')} {String(n).padStart(2, '0')}
                      </span>
                      <Tag kind={tagKindForState(articleStates[n])}>
                        {t(`registerV5.v3.marginalia.state.${articleStates[n]}`)}
                      </Tag>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Page footer / actions */}
          <div
            style={{
              borderTop: '1.5px solid var(--ct-ink)',
              padding: '10px 18px',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              background: 'var(--ct-paper)',
            }}
          >
            <span className="ct-cert-no">{t('registerV5.v3.footer.page')}</span>
            <span className="ct-spacer" />
            <span className="ct-cert-no" data-testid="register-v3-progress">
              {t('registerV5.v3.footer.progress', {
                done: completeCount,
                total: 5,
              })}
            </span>
          </div>
        </div>
      </div>

      <FooterRibbon buildSha={BUILD_SHA} buildDate={BUILD_DATE} />
    </main>
    </QtspScopeContext.Provider>
  );
}

// ─────────────── document chrome subcomponents ───────────────

function Article({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr',
        columnGap: 14,
        padding: '10px 0',
        borderTop: '1px solid var(--ct-ink)',
      }}
      data-testid={`register-v3-article-${n}`}
    >
      <div
        style={{
          fontFamily: 'var(--display)',
          fontSize: 22,
          lineHeight: 1,
          color: 'var(--ua-blue)',
          letterSpacing: '.04em',
        }}
      >
        ART.
        <br />
        {String(n).padStart(2, '0')}
      </div>
      <div>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: 'var(--ct-mute)',
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

function Recital({
  start = 1,
  lines,
}: {
  start?: number;
  lines: React.ReactNode[];
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        columnGap: 10,
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {lines.map((ln, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Recital.Row key={i} n={start + i} line={ln} />
      ))}
    </div>
  );
}
Recital.Row = function RecitalRow({ n, line }: { n: number; line: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          color: 'var(--ct-mute)',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          paddingRight: 4,
          borderRight: '1px solid rgba(26,26,26,.2)',
        }}
      >
        {String(n).padStart(2, '0')}
      </div>
      <div>{line}</div>
    </>
  );
};

function SignatureBlock({
  legend,
  bottomLeft,
  bottomRight,
  bottomRightOk,
  children,
}: {
  legend: string;
  bottomLeft: string;
  bottomRight: string;
  bottomRightOk: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          height: 76,
          border: '1.5px solid var(--ct-ink)',
          background: '#fff',
          padding: 10,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <span className="ct-cert-no" style={{ position: 'absolute', top: 6, left: 8 }}>
          {legend}
        </span>
        {children}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="ct-cert-no">{bottomLeft}</span>
        <span
          className="ct-cert-no"
          style={bottomRightOk ? { color: 'var(--ok)' } : undefined}
        >
          {bottomRight}
        </span>
      </div>
    </div>
  );
}

function Seal() {
  // Civic-terminal seal — concentric circle stamp echo of the
  // wireframe's <Seal/> component. Pure visual chrome.
  return (
    <div
      aria-hidden="true"
      style={{
        width: 60,
        height: 60,
        borderRadius: '50%',
        border: '2px solid var(--ua-blue)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ua-blue)',
        fontFamily: 'var(--display)',
        fontSize: 10,
        letterSpacing: '.1em',
        textAlign: 'center',
        lineHeight: 1.1,
      }}
    >
      ZK
      <br />
      QES
    </div>
  );
}

function Tag({
  kind,
  children,
}: {
  kind?: 'ok' | 'warn' | 'err' | 'ua' | 'eu' | undefined;
  children: React.ReactNode;
}) {
  const cls = kind ? `ct-tag ct-tag--${kind}` : 'ct-tag';
  return <span className={cls}>{children}</span>;
}

function tagKindForState(s: ArticleState): 'ok' | 'warn' | undefined {
  switch (s) {
    case 'complete':
      return 'ok';
    case 'pending':
      return 'warn';
    case 'read':
    case 'awaiting':
    default:
      return undefined;
  }
}

/**
 * Route wrapper — reads `?qtsp=` from TanStack Router and threads it
 * into `RegisterV5Screen`. Default export so `lazyRouteComponent`
 * picks it up; both `/ua/registerV5` and `/v5/registerV5` route
 * declarations point at this same component.
 *
 * `useSearch({ strict: false })` accepts any search-param shape
 * without requiring a per-route schema. The cast narrows it to the
 * `qtsp` field this component cares about; unrecognized params
 * pass through untouched.
 */
export default function RegisterV5Route(): JSX.Element {
  const search = useSearch({ strict: false }) as { qtsp?: string };
  return <RegisterV5Screen searchParams={search} />;
}
