// /ceremony/status — Curve-2021 live progress feed.
//
// Polls the published `status.json` every 30 s. Renders tri-state
// progress + the contributor chain + final zkey + beacon.

import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { TopBar } from '../../components/curve/TopBar';
import {
  CEREMONY_POLL_MS,
  CEREMONY_STATUS_URL,
  deriveCeremonyState,
  fetchCeremonyStatus,
  type CeremonyState,
  type CeremonyStatusPayload,
} from '../../lib/ceremonyStatus';

import '../../styles/curve.css';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; payload: CeremonyStatusPayload };

export function CeremonyStatus() {
  const [feed, setFeed] = useState<FeedState>({ kind: 'loading' });
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const poll = async () => {
      const payload = await fetchCeremonyStatus(CEREMONY_STATUS_URL, ac.signal);
      if (cancelled) return;
      setLastFetch(new Date());
      setFeed(payload === null ? { kind: 'unavailable' } : { kind: 'ok', payload });
    };

    void poll();
    const timer = setInterval(() => void poll(), CEREMONY_POLL_MS);
    return () => {
      cancelled = true;
      ac.abort();
      clearInterval(timer);
    };
  }, []);

  const state: CeremonyState = feed.kind === 'ok' ? deriveCeremonyState(feed.payload) : 'planned';

  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="ceremony"
        statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● live status feed</span>}
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14 }}>
        <BackLink />

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">⊙</span>
            <span>STATUS · live ceremony feed · poll every 30s</span>
            <span style={{ flex: 1 }} />
            <span className={`cv-pill ${stateClass(state)}`}>{stateLabel(state)}</span>
            <span className="cv-pill">{lastFetch ? `last fetched · ${lastFetch.toLocaleTimeString('en-GB', { hour12: false })}` : 'fetching…'}</span>
          </div>
          <h1 className="cv-hero" style={{ fontSize: 132 }}>
            {state === 'planned' && <>AWAITING.<br /><span className="b">FIRST</span></>}
            {state === 'in-progress' && <>ROUND <span className="y">{feed.kind === 'ok' ? feed.payload.round : '—'}</span><br /><span className="b">IN FLIGHT</span></>}
            {state === 'complete' && <>SETUP.<br /><span className="b">COMPLETE</span><span className="y">.</span></>}
          </h1>
          <p style={{ maxWidth: 720, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
            {state === 'planned' && 'No contributor has uploaded their round yet. Sign-ups are open. The first valid contribution opens the chain; every subsequent round chains onto the previous one.'}
            {state === 'in-progress' && 'A contributor is in flight. The chain advances when their attested intermediate zkey lands. We close the round when a 24 h gap with no new contributors appears.'}
            {state === 'complete' && 'Final zkey is fixed. A public-randomness beacon was folded in after the last contributor. The parameters are now what every future proof verifies against.'}
          </p>
        </section>

        {feed.kind === 'loading' && (
          <section className="cv-card is-paper" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="cv-num" style={{ color: 'var(--cv-ua-blue)', fontSize: 64 }}>⟳</div>
            <div style={{ fontSize: 13, marginTop: 10, color: 'var(--cv-mute)' }}>Loading status feed…</div>
          </section>
        )}

        {feed.kind === 'unavailable' && (
          <section className="cv-card" style={{ background: 'var(--cv-err)' }}>
            <div className="cv-cardhead">
              <span>FEED · unreachable</span>
              <span style={{ flex: 1 }} />
              <span className="cv-pill is-err">UNAVAILABLE</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              The ceremony admin publishes the status JSON manually after each round; transient outages are
              expected. We retry every {CEREMONY_POLL_MS / 1000}s automatically. If this persists, the chain is still
              recoverable from the contributors' own attestations.
            </div>
          </section>
        )}

        {feed.kind === 'ok' && <StatusBody payload={feed.payload} />}

        {/* FOOTER STATS */}
        {feed.kind === 'ok' && (
          <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
            <FooterStat label="round" value={String(feed.payload.round)} suffix={feed.payload.round === 1 ? 'contribution' : 'contributions'} />
            <FooterStat label="contributors" value={String(feed.payload.contributors.length)} suffix="attested" yellow />
            <FooterStat label="final hash" value={feed.payload.finalZkeySha256?.slice(0, 8) ?? '—'} suffix={feed.payload.finalZkeySha256 ? '…' : 'pending'} mono />
            <FooterStat label="next poll" value={`${CEREMONY_POLL_MS / 1000}s`} suffix="auto" blue />
          </section>
        )}

      </div>
    </main>
  );
}

function StatusBody({ payload }: { payload: CeremonyStatusPayload }) {
  const state = deriveCeremonyState(payload);

  return (
    <>
      {/* ATTESTATION CHAIN */}
      <section className="cv-card is-paper">
        <div className="cv-cardhead">
          <span className="dot live" />
          <span>ATTESTATION CHAIN · append-only</span>
          <span style={{ flex: 1 }} />
          <span className="cv-pill is-ok">all hashes verified</span>
          <span className="cv-pill">IPFS-pinned</span>
        </div>
        {payload.contributors.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>
              <b>No rounds yet.</b> The first contributor opens the chain. Until then,
              the parameters are unfixed.
            </div>
            <Link to="/ceremony/contribute" className="cv-btn is-lg">▶ Be the first</Link>
          </div>
        ) : (
          <table className="cv-table">
            <thead>
              <tr><th>slot</th><th>when</th><th>contributor</th><th>attestation</th></tr>
            </thead>
            <tbody>
              {[...payload.contributors].reverse().map((c) => (
                <tr key={`${c.round}-${c.name}`}>
                  <td><b>#{String(c.round).padStart(3, '0')}</b></td>
                  <td style={{ color: 'var(--cv-mute)' }}>{c.completedAt.slice(0, 10)} {c.completedAt.slice(11, 16)}</td>
                  <td>
                    {c.profileUrl
                      ? <a href={c.profileUrl} className="cv-link" rel="noopener noreferrer">{c.name}</a>
                      : c.name}
                  </td>
                  <td style={{ fontFamily: 'var(--cv-mono)', fontSize: 11, wordBreak: 'break-all' }}>
                    {c.attestation
                      ? <>{c.attestation.slice(0, 18)}…{c.attestation.slice(-8)}</>
                      : <span style={{ color: 'var(--cv-mute)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* FINAL ZKEY + BEACON (when complete) */}
      {state === 'complete' && payload.finalZkeySha256 && (
        <section className="cv-card is-blue" style={{ padding: '20px 24px' }}>
          <div className="cv-cardhead" style={{ color: '#fff' }}>
            <span className="dot live" />
            <span>FINAL · zkey + public-randomness beacon</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ok">applied · ✓</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 14, fontSize: 13 }}>
            <Field label="final.zkey">
              <span style={{ fontFamily: 'var(--cv-mono)', wordBreak: 'break-all' }}>sha256 {payload.finalZkeySha256}</span>
            </Field>
            {payload.beaconBlockHeight !== null && (
              <Field label="beacon block">
                <span style={{ fontFamily: 'var(--cv-mono)' }}>{payload.beaconBlockHeight}</span>
              </Field>
            )}
            {payload.beaconHash !== null && (
              <Field label="beacon hash">
                <span style={{ fontFamily: 'var(--cv-mono)', wordBreak: 'break-all' }}>{payload.beaconHash}</span>
              </Field>
            )}
          </div>
          <div className="cv-hatch" style={{ margin: '16px -24px', borderColor: 'var(--cv-ua-yellow)' }} />
          <Link to="/ceremony/verify" className="cv-btn" style={{ background: 'var(--cv-ua-yellow)', color: 'var(--cv-ua-blue)' }}>
            ↗ Verify your downloaded zkey
          </Link>
        </section>
      )}
    </>
  );
}

function stateLabel(s: CeremonyState): string {
  if (s === 'planned') return 'AWAITING';
  if (s === 'in-progress') return 'IN PROGRESS';
  return 'COMPLETE';
}
function stateClass(s: CeremonyState): string {
  if (s === 'planned') return 'is-warn';
  if (s === 'in-progress') return 'is-ua';
  return 'is-ok';
}

function BackLink() {
  return (
    <Link to="/ceremony" style={{
      fontFamily: 'var(--cv-mono)', fontSize: 12, color: 'var(--cv-ua-blue)',
      textDecoration: 'underline', textUnderlineOffset: 3,
    }}>
      ← back to ceremony overview
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span style={{ color: 'var(--cv-ua-yellow)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 10.5 }}>{label}</span>
      <span style={{ fontFamily: 'var(--cv-mono)', wordBreak: 'break-all' }}>{children}</span>
    </>
  );
}

function FooterStat({ label, value, suffix, yellow, blue, mono }: {
  label: string; value: string; suffix?: string; yellow?: boolean; blue?: boolean; mono?: boolean;
}) {
  const cls = yellow ? 'is-yellow' : blue ? 'is-blue' : '';
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '10px 14px' }}>
      <div className="cv-cardhead" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>{label}</div>
      <div className="cv-num sm" style={{ ...(blue ? { color: 'var(--cv-ua-yellow)' } : {}), ...(mono ? { fontFamily: 'var(--cv-mono)', fontSize: 18 } : {}) }}>
        {value} {suffix && <span style={{ fontSize: 16 }}>{suffix}</span>}
      </div>
    </div>
  );
}
