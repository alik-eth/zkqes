// DeviceReadinessGate — browser + CLI dual-path gate.
//
// Plan: docs/superpowers/plans/2026-05-04-zkqes-civic-terminal-v2-web.md Task 8.
// Spec: 2026-05-04-zkqes-civic-terminal-v2-design.md §5.0.
//
// Two acceptance paths unlock the form: a Firefox≥120 + ≥8 GB-RAM browser
// (in-Worker snarkjs prove, ~90 s, ~38 GB peak), or a `zkqes serve`-running
// localhost:9080 native rapidsnark CLI (~14 s, ~3.7 GB peak; works on any
// browser). CLI presence is checked first so a denied-browser user with a
// running CLI gets through.
//
// The gate composes:
//   - `assessV2BrowserCapability()` (synchronous; deviceGate.ts §V2 block).
//   - `useCliPresence()`            (mount + visibilitychange polling; web
//                                    CLAUDE.md invariant 19).
//
// Existing `assessDeviceCapability` (V5.0 mobile-flagship gate) stays
// exported alongside; legacy `/ua/use-desktop` consumers don't migrate
// during this dispatch.

import { type ReactNode, useEffect, useState } from 'react';
import {
  assessV2BrowserCapability,
  type V2DeviceCapability,
} from '../../lib/deviceGate';
import { useCliPresence } from '../../hooks/useCliPresence';

interface DeviceReadinessGateProps {
  readonly children: ReactNode;
}

const PANEL_BASE = {
  padding: 'var(--ct-pad)',
  fontFamily: 'var(--mono)',
} as const;

export function DeviceReadinessGate({ children }: DeviceReadinessGateProps) {
  const [browserCheck, setBrowserCheck] = useState<V2DeviceCapability | null>(
    null,
  );
  const cli = useCliPresence();

  useEffect(() => {
    setBrowserCheck(assessV2BrowserCapability());
  }, []);

  // Brief detecting-state — only visible during the first paint before the
  // synchronous capability check has run. Kept for SSR-safety + cleanliness.
  if (browserCheck === null) {
    return (
      <div className="ct-panel" style={PANEL_BASE}>
        ◐ checking your device …
      </div>
    );
  }

  // CLI presence wins — a running localhost CLI is the cheapest, fastest
  // prover and works regardless of browser capability.
  if (cli.status === 'present') {
    return (
      <>
        <div className="ct-panel" style={PANEL_BASE}>
          <span className="ct-tag">DEVICE READY · CLI DETECTED</span>
          <br />
          ✓ zkqes serve detected at localhost:9080
          <br />
          <small>proving will offload to native rapidsnark · ~14 s</small>
        </div>
        {children}
      </>
    );
  }

  if (browserCheck.kind === 'ready-browser') {
    return (
      <>
        <div className="ct-panel" style={PANEL_BASE}>
          <span className="ct-tag">DEVICE READY</span>
          <br />✓ {browserCheck.browser} · {browserCheck.deviceMemory} GB+ RAM
          detected
          <br />
          <small>
            proving will run in a Web Worker · ~90 s · ~38 GB peak
          </small>
        </div>
        {children}
      </>
    );
  }

  // Denied: render the two-option fallback panel. `detected` is always
  // present because we only reach this branch on `kind === 'denied'`.
  const detected = browserCheck.detected;
  return (
    <div
      className="ct-panel ct-tag--warn"
      style={PANEL_BASE}
      role="alert"
    >
      <strong>DEVICE NOT READY</strong>
      <p>This device can't run the prover. You have two options:</p>
      <div
        className="ct-panel"
        style={{ marginTop: '12px', padding: '12px' }}
      >
        <strong>OPTION A · Firefox 64-bit ≥120 with 32 GB RAM</strong>
        <p>
          Open this page in Firefox on a desktop with 32 GB+ RAM. Proving runs
          in a Web Worker; ~90 s wall time, ~38 GB peak memory.
        </p>
        <p>
          <small>
            Detected: {detected.browser} · {detected.deviceMemory}
          </small>
        </p>
      </div>
      <div
        className="ct-panel"
        style={{ marginTop: '12px', padding: '12px' }}
      >
        <strong>OPTION B · Install zkqes CLI prover</strong>
        <p>
          Run native rapidsnark locally; the browser auto-detects it. ~14 s
          wall time, ~3.7 GB peak. Works on any browser.
        </p>
        <pre
          style={{
            background: 'var(--ct-paper-3)',
            padding: '8px',
            borderRadius: '2px',
          }}
        >
          {`▣ npm install -g @zkqes/cli\n▣ zkqes serve`}
        </pre>
      </div>
    </div>
  );
}
