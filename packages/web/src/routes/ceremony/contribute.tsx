// /ceremony/contribute — Curve-2021 contributor runbook.
//
// The four commands as 4 large step-cards. Requirements as a 4-card
// readiness row. Fly launcher form embedded below for one-shot path.
// Sign up = mailto. Same shape across landing + app builds.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { TopBar } from '../../components/curve/TopBar';
import { FlyLauncherForm } from '../../components/ceremony/FlyLauncherForm';
import '../../styles/curve.css';

const ROUND = 'round-N';
const PREV_ZKEY = `${ROUND}-prev.zkey`;
const MINE_ZKEY = `${ROUND}-mine.zkey`;
const UPLOAD_URL = '$YOUR_SIGNED_UPLOAD_URL';

const STEPS = [
  {
    n: '01',
    title: 'Download the previous zkey',
    body: 'About 4.2 GB. The download URL for your assigned round is sent at sign-up time. Verify the SHA-256 against the chain before proceeding.',
    cmd: `curl -O https://prove.zkqes.org/ceremony/${PREV_ZKEY}`,
    time: '~5 min',
    fail: 'curl 403 → URL expired; ask coord for a fresh link.',
  },
  {
    n: '02',
    title: 'Run your contribution',
    body: 'Around 20–25 minutes wall-clock on a 38 GB-RAM machine. snarkjs holds the intermediate key + working memory in V8 heap; expect ~38 GB peak. Use any high-quality entropy source — hardware RNG, dice, /dev/urandom + a system you trust.',
    cmd: `snarkjs zkey contribute ${PREV_ZKEY} ${MINE_ZKEY} \\
  --name="<your handle>" --entropy="<your random bytes>"`,
    time: '~25 min',
    fail: 'OOM kill → not enough RAM. Use a Hetzner CCX43 (Path 02) or Fly performance-4x (Path 03).',
  },
  {
    n: '03',
    title: 'Verify locally before uploading',
    body: 'Runs in seconds. Confirms your output zkey is structurally valid against the circuit r1cs and the Phase 1 powers-of-tau. If verify fails, do not upload — you keep your entropy and we restart your round.',
    cmd: `snarkjs zkey verify zkqes-v5.r1cs powersOfTau28_hez_final_22.ptau ${MINE_ZKEY}`,
    time: '~30 sec',
    fail: 'Verify fails → discard zkey, regenerate entropy, redo step 02. Never upload an unverified contribution.',
  },
  {
    n: '04',
    title: 'Upload via your signed URL',
    body: 'The signed URL is single-use, time-bounded, and tied to your assigned round. Do not share it. Once uploaded, your contribution gets attested and chained onto the previous round.',
    cmd: `curl -F "file=@${MINE_ZKEY}" ${UPLOAD_URL}`,
    time: '~1 min',
    fail: 'curl 403/410 → URL expired or already used. Ask coord for a fresh URL; this round will need to be redone.',
  },
] as const;

const REQUIREMENTS = [
  { label: '38 GB RAM', detail: 'snarkjs ~38 GB peak in V8 heap', critical: true },
  { label: '5 GB disk', detail: 'download + working space + output zkey', critical: false },
  { label: 'Linux / macOS / WSL', detail: 'Node 20+ · snarkjs ≥ 0.7.4', critical: false },
  { label: '30–40 minutes', detail: 'download → contribute → verify → upload', critical: false },
] as const;

export function CeremonyContribute() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--cv-page)' }}>
      <TopBar
        active="ceremony"
        statusPill={<span className="cv-pill" style={{ background: 'transparent', color: '#f4f0e0', borderColor: '#f4f0e0' }}>● contributor runbook</span>}
      />

      <div style={{ padding: '18px 22px 32px', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <BackLink />

        {/* HERO */}
        <section className="cv-card is-stripe" style={{ padding: '24px 26px' }}>
          <div className="cv-cardhead" style={{ marginBottom: 12 }}>
            <span className="cv-ix">▶</span>
            <span>CONTRIBUTOR RUNBOOK · the entire ceremony for one contributor</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-ua">~25 min wall-clock</span>
            <span className="cv-pill">snarkjs ≥ 0.7.4</span>
          </div>
          <div className="cv-resp" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'flex-end' }}>
            <div>
              <h1 className="cv-hero" style={{ fontSize: 138 }}>
                FOUR.<br /><span className="b">COMMANDS</span><span className="y">.</span>
              </h1>
              <p style={{ maxWidth: 700, fontSize: 14, marginTop: 18, lineHeight: 1.55 }}>
                The actual contribution runs as a local <code style={{ background: 'var(--cv-ua-yellow)', padding: '1px 6px', border: '1.5px solid var(--cv-ink)' }}>snarkjs</code> CLI invocation
                on your laptop or workstation. The browser cannot host it — V8 caps WebAssembly at 4 GB of heap and the prover key needs more than that to ingest.
                Below are the four exact commands you'll run, with copy buttons + what-could-go-wrong notes.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <span className="cv-sticker">free · 25 min</span>
              <a
                href={mailtoSignup()}
                className="cv-btn is-lg"
                style={{ minWidth: 240, justifyContent: 'center' }}
              >
                ▶ Sign up for a round
              </a>
              <a
                href="#fly"
                className="cv-btn is-blue is-lg"
                style={{ minWidth: 240, justifyContent: 'center' }}
              >
                ↳ Use the Fly launcher
              </a>
            </div>
          </div>
        </section>

        {/* REQUIREMENTS */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          REQUIREMENTS.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          Phones, tablets, and Chromebooks <b>cannot contribute</b> — heap caps are too low and the
          disk requirement exceeds typical mobile-class storage.
        </p>
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {REQUIREMENTS.map((r) => (
            <div key={r.label} className={`cv-card ${r.critical ? 'is-yellow' : 'is-paper'}`}>
              <div className="cv-cardhead">
                <span className={`cv-pill ${r.critical ? 'is-err' : ''}`}>{r.critical ? 'must have' : 'standard'}</span>
              </div>
              <div className="cv-num sm" style={{ fontSize: 28, color: 'var(--cv-ua-blue)' }}>{r.label}</div>
              <div style={{ fontSize: 12, color: 'var(--cv-mute)', marginTop: 6, lineHeight: 1.45 }}>{r.detail}</div>
            </div>
          ))}
        </section>

        {/* THE FOUR COMMANDS */}
        <h2 style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0' }}>
          THE COMMANDS.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          Run them in order. Each panel has a copy button and a "what could go wrong" note. Do not skip step 03.
        </p>

        <section className="cv-resp" style={{ display: 'grid', gap: 14 }}>
          {STEPS.map((s, i) => {
            const accent: 'paper' | 'yellow' | 'blue' = i === 1 ? 'yellow' : i === 3 ? 'blue' : 'paper';
            return (
              <CommandCard key={s.n} step={s} accent={accent} />
            );
          })}
        </section>

        {/* FLY LAUNCHER ALTERNATIVE */}
        <h2 id="fly" style={{ fontFamily: 'var(--cv-display)', fontSize: 56, lineHeight: 1, margin: '12px 0 0', scrollMarginTop: 80 }}>
          OR · ONE-SHOT LAUNCHER.
        </h2>
        <p style={{ fontSize: 13, color: 'var(--cv-mute)', maxWidth: '70ch', margin: 0 }}>
          For contributors who would rather paste five form values than memorise the four commands.
          We hand you a single <code>fly launch</code> sequence; you paste it into your own terminal.
          Entropy never leaves your browser.
        </p>
        <section className="cv-card is-paper">
          <FlyLauncherForm />
        </section>

        {/* SIGN UP */}
        <section className="cv-card is-yellow" style={{ padding: '20px 24px' }}>
          <div className="cv-cardhead">
            <span className="cv-ix">+</span>
            <span>SIGN UP · become a contributor</span>
            <span style={{ flex: 1 }} />
            <span className="cv-pill is-blue">we ping you when the round opens</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
              Email <b>ceremony@zkqes.org</b> with your handle, preferred contribution slot, and a short note
              on who you are. The coordinator assigns rounds in arrival order and replies with your download
              URL + signed-upload URL. No mailing list, no analytics — one email per round, then we forget you.
            </div>
            <a href={mailtoSignup()} className="cv-btn is-blue is-lg">▶ Open mail draft</a>
          </div>
        </section>

        {/* FOOTER STATS */}
        <section className="cv-resp" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
          <FooterStat label="ram" value="38" suffix="GB" />
          <FooterStat label="time" value="~25" suffix="min" yellow />
          <FooterStat label="cost" value="0" suffix="paths 1+3 free" />
          <FooterStat label="upload" value="signed" suffix="single-use" blue />
        </section>

      </div>
    </main>
  );
}

function CommandCard({ step, accent }: {
  step: typeof STEPS[number];
  accent: 'paper' | 'yellow' | 'blue';
}) {
  const [copied, setCopied] = useState(false);
  const isBlue = accent === 'blue';
  const cls = accent === 'paper' ? 'is-paper' : accent === 'yellow' ? 'is-yellow' : 'is-blue';
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '18px 20px' }}>
      <div className="cv-cardhead" style={isBlue ? { color: '#fff' } : undefined}>
        <span className="cv-ix">{step.n}</span>
        <span>{step.title}</span>
        <span style={{ flex: 1 }} />
        <span className="cv-pill">⏱ {step.time}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: '4px 0 12px', maxWidth: '80ch' }}>
        {step.body}
      </p>
      <div style={{ position: 'relative' }}>
        <pre style={{
          background: '#0d0d0d', color: '#e8e2cc',
          border: '2px solid var(--cv-ink)',
          margin: 0, padding: '14px 16px', paddingRight: 96,
          fontFamily: 'var(--cv-mono)', fontSize: 13, lineHeight: 1.6,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{step.cmd}</pre>
        <button
          onClick={() => {
            navigator.clipboard.writeText(step.cmd).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="cv-btn is-sm"
          style={{ position: 'absolute', top: 10, right: 10 }}
        >
          {copied ? '✓ copied' : '📋 copy'}
        </button>
      </div>
      <div className="cv-hatch" style={{ margin: '14px -20px', ...(isBlue ? { borderColor: 'var(--cv-ua-yellow)' } : {}) }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, fontSize: 12.5, alignItems: 'baseline' }}>
        <span className="cv-pill is-err">if it fails</span>
        <span style={isBlue ? { color: 'var(--cv-ua-yellow)' } : { color: 'var(--cv-mute)' }}>{step.fail}</span>
      </div>
    </div>
  );
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

function FooterStat({ label, value, suffix, yellow, blue }: {
  label: string; value: string; suffix?: string; yellow?: boolean; blue?: boolean;
}) {
  const cls = yellow ? 'is-yellow' : blue ? 'is-blue' : '';
  return (
    <div className={`cv-card ${cls}`} style={{ padding: '10px 14px' }}>
      <div className="cv-cardhead" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>{label}</div>
      <div className="cv-num sm" style={blue ? { color: 'var(--cv-ua-yellow)' } : undefined}>
        {value} {suffix && <span style={{ fontSize: 16 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function mailtoSignup() {
  const subject = encodeURIComponent('zkqes ceremony · contributor signup');
  const body = encodeURIComponent(
    'Hi —\n\nI want to contribute to the zkqes Phase 2 trusted-setup ceremony.\n\n' +
    'Handle (github / x / ens): \n' +
    'Preferred path (snarkjs · VPS · Fly): \n' +
    'Hardware available (RAM, OS): \n\n' +
    'Ping me when the next round opens.\n',
  );
  return `mailto:ceremony@zkqes.org?subject=${subject}&body=${body}`;
}
