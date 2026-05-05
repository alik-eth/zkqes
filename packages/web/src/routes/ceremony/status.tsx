// V5 Phase 2 ceremony — live status feed.
//
// Polls the published `status.json` every 30 s and renders the
// contributor chain + tri-state progress (planned / in-progress / complete).
//
// Production feed: https://prove.zkqes.org/ceremony/status.json
// Dev fixture:     /ceremony/status.json (committed in this repo)
// Test override:   VITE_CEREMONY_STATUS_URL env var
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentFooter } from '../../components/DocumentFooter';
import '../../styles/civic-terminal.css';
import {
  CEREMONY_POLL_MS,
  CEREMONY_STATUS_URL,
  deriveCeremonyState,
  fetchCeremonyStatus,
  type CeremonyState,
  type CeremonyStatusPayload,
} from '../../lib/ceremonyStatus';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; payload: CeremonyStatusPayload };

export function CeremonyStatus() {
  const { t } = useTranslation();
  const [feed, setFeed] = useState<FeedState>({ kind: 'loading' });

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const poll = async (): Promise<void> => {
      const payload = await fetchCeremonyStatus(CEREMONY_STATUS_URL, ac.signal);
      if (cancelled) return;
      setFeed(payload === null ? { kind: 'unavailable' } : { kind: 'ok', payload });
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, CEREMONY_POLL_MS);

    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(timer);
    };
  }, []);

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
        <Link to="/ceremony" className="ct-link" style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
          ← {t('ceremony.status.back', 'back to overview')}
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
            {t('ceremony.status.heading', 'Live progress.')}
          </h1>
            <p className="text-base max-w-prose" style={{ color: 'var(--ct-ink)' }}>
              {t(
                'ceremony.status.lede',
                'Each round closes when the contributor uploads their attested intermediate zkey. We publish the chain here as it grows.',
              )}
            </p>
          </header>

          <hr className="ct-divider" />

          {feed.kind === 'loading' && (
            <p
              className="text-sm"
              role="status"
              data-testid="ceremony-status-loading"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('ceremony.status.loading', 'Loading status feed…')}
            </p>
          )}

          {feed.kind === 'unavailable' && (
            <p
              className="text-sm"
              role="alert"
              data-testid="ceremony-status-unavailable"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t(
                'ceremony.status.unavailable',
                'Status feed unavailable. The ceremony admin publishes the JSON manually after each round; transient outages are expected. Try again in a minute.',
              )}
            </p>
          )}

        {feed.kind === 'ok' && (
          <StatusBody payload={feed.payload} />
        )}
      </div>
      <DocumentFooter />
    </main>
  );
}

function StatusBody({ payload }: { payload: CeremonyStatusPayload }) {
  const { t } = useTranslation();
  const state: CeremonyState = deriveCeremonyState(payload);

  return (
    <>
      <section
        aria-labelledby="state-heading"
        data-testid={`ceremony-state-${state}`}
        className="space-y-6"
      >
        <h2
          id="state-heading"
          className="text-3xl"
          style={{ color: 'var(--ct-ink)' }}
        >
          {state === 'planned' &&
            t('ceremony.status.statePlanned', 'Awaiting first contributor.')}
          {state === 'in-progress' &&
            t('ceremony.status.stateInProgress', 'Ceremony in progress.')}
          {state === 'complete' &&
            t('ceremony.status.stateComplete', 'Ceremony complete.')}
        </h2>
        <p
          className="text-base max-w-prose"
          style={{ color: 'var(--ct-ink)' }}
          data-testid="ceremony-state-blurb"
        >
          {state === 'planned' &&
            t(
              'ceremony.status.plannedBlurb',
              'The first contributor has not yet uploaded their round. Sign-ups are open.',
            )}
          {state === 'in-progress' &&
            t('ceremony.status.inProgressBlurb', {
              defaultValue: 'Round {{round}} of {{total}}.',
              round: payload.round,
              total: payload.totalRounds,
            })}
          {state === 'complete' &&
            t(
              'ceremony.status.completeBlurb',
              'The final zkey is fixed. Anyone can verify their downloaded copy below.',
            )}
        </p>
      </section>

      <hr className="ct-divider" />

      <section
        aria-labelledby="chain-heading"
        data-testid="ceremony-chain"
        className="space-y-6"
      >
        <h2
          id="chain-heading"
          className="text-3xl"
          style={{ color: 'var(--ct-ink)' }}
        >
          {t('ceremony.status.chainHeading', 'Contributor chain')}
        </h2>
        {payload.contributors.length === 0 ? (
          <p
            className="text-base"
            style={{ color: 'var(--ct-ink)', opacity: 0.7 }}
            data-testid="ceremony-chain-empty"
          >
            {t('ceremony.status.chainEmpty', 'No rounds yet.')}
          </p>
        ) : (
          <ol className="space-y-6" data-testid="ceremony-chain-list">
            {payload.contributors.map((c) => (
              <li
                key={`${c.round}-${c.name}`}
                className="space-y-1"
                data-testid={`ceremony-contributor-${c.round}`}
              >
                <div
                  className="text-sm"
                  style={{
                    color: 'var(--ua-blue)',
                    fontVariant: 'small-caps',
                    letterSpacing: '0.08em',
                  }}
                >
                  <span aria-hidden="true" style={{ color: 'var(--ct-mute)', marginRight: '0.5em' }}>
                    {c.round}
                  </span>
                  {t('ceremony.status.roundLabel', 'Round')} {c.round}
                </div>
                <div className="text-base" style={{ color: 'var(--ct-ink)' }}>
                  {c.profileUrl ? (
                    <a href={c.profileUrl} style={{ color: 'var(--ua-blue)' }}>
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </div>
                <div className="text-mono text-xs" style={{ color: 'var(--ct-ink)', opacity: 0.7 }}>
                  {c.completedAt}
                </div>
                {c.attestation && (
                  <div className="text-mono text-xs break-all" style={{ color: 'var(--ct-ink)', opacity: 0.6 }}>
                    {c.attestation}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {payload.finalZkeySha256 && (
        <>
          <hr className="ct-divider" />
          <section
            aria-labelledby="final-heading"
            data-testid="ceremony-final"
            className="space-y-3"
          >
            <h2
              id="final-heading"
              className="text-3xl"
              style={{ color: 'var(--ct-ink)' }}
            >
              {t('ceremony.status.finalHeading', 'Final zkey')}
            </h2>
            <p
              className="text-mono text-sm break-all"
              data-testid="ceremony-final-hash"
              style={{ color: 'var(--ct-ink)' }}
            >
              sha256 {payload.finalZkeySha256}
            </p>
            {payload.beaconBlockHeight !== null &&
              payload.beaconHash !== null && (
                <p className="text-mono text-xs break-all" style={{ color: 'var(--ct-ink)', opacity: 0.7 }}>
                  beacon block {payload.beaconBlockHeight} {payload.beaconHash}
                </p>
              )}
            <p className="text-base" style={{ color: 'var(--ct-ink)' }}>
              <Link to="/ceremony/verify" style={{ color: 'var(--ua-blue)' }}>
                {t('ceremony.status.verifyLink', 'Verify your downloaded zkey →')}
              </Link>
            </p>
          </section>
        </>
      )}
    </>
  );
}
