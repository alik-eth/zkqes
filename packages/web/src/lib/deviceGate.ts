// Device-capability gate for the V5 in-browser prover.
//
// Per spec amendment 9c866ad (review pass 5), mobile-browser is now a hard
// acceptance gate narrowed to flagship 2024+ phones (Pixel 9 + iPhone 15
// Safari) with `navigator.storage.persist()` granted. Out-of-gate devices
// (mid-range Android, iOS WebView, <8 GB RAM phones, older browsers) MUST
// be detected and rerouted to a "use desktop" page BEFORE zkey download
// to prevent OOM / quota-exhaustion failures.
//
// This module does the detection. Routing is the caller's responsibility
// (Step 1 of /ua/registerV5 → /ua/use-desktop on `denied`).

export type DeviceCapability =
  | { kind: 'ready'; quotaBytes: number; persistGranted: true }
  | {
      kind: 'denied';
      reason:
        | 'no-storage-api'
        | 'low-quota'
        | 'persist-denied'
        | 'webview-detected'
        | 'low-ram'
        | 'old-browser';
    };

// Minimum storage quota the prover needs cached (zkey + wasm + ptau slice).
// Spec §Risks pegs this at ~2.5 GB worst-case; we round to 3 GB to leave
// headroom for the browser's own cache eviction policy.
const MIN_QUOTA_BYTES = 3_000_000_000;

// In-app webview UA-string patterns. These browsers either don't expose
// the Storage API at full quota, gate persist() behind opaque rules, or
// kill the tab on backgrounding mid-proof. All three break the V5 flow.
//
// Order matters only for performance; any match short-circuits.
const WEBVIEW_PATTERNS: readonly RegExp[] = [
  /Telegram/i,
  /Instagram/i,
  /\bFBAN\b|\bFBAV\b|\bFB_IAB\b/, // Facebook in-app browser markers
  /TwitterAndroid|Twitter for/i,
  /\bLine\//i,
  /MicroMessenger/i, // WeChat
  /KAKAOTALK/i,
  /; wv\)/i, // Android WebView generic marker
];

export function isInAppWebView(userAgent: string): boolean {
  return WEBVIEW_PATTERNS.some((re) => re.test(userAgent));
}

export async function assessDeviceCapability(): Promise<DeviceCapability> {
  // SSR / no-navigator environments (extremely old browsers, headless tools
  // without UA shimming). Treat as old-browser rather than crashing.
  if (typeof navigator === 'undefined') {
    return { kind: 'denied', reason: 'old-browser' };
  }

  // Step 1: Storage API feature detect.
  const storage = (navigator as Navigator).storage as
    | (StorageManager & { persist?: () => Promise<boolean>; estimate?: () => Promise<StorageEstimate> })
    | undefined;
  if (
    !storage ||
    typeof storage.persist !== 'function' ||
    typeof storage.estimate !== 'function'
  ) {
    return { kind: 'denied', reason: 'no-storage-api' };
  }

  // Step 2: in-app WebView sniff (Telegram, Instagram, Facebook, Twitter,
  // Line, WeChat, KakaoTalk, generic Android WebView).
  if (isInAppWebView(navigator.userAgent ?? '')) {
    return { kind: 'denied', reason: 'webview-detected' };
  }

  // Step 3: quota check. Sub-3 GB allocation can't host the full zkey +
  // wasm + ptau slice without eviction churn.
  const estimate = await storage.estimate();
  const quota = estimate.quota ?? 0;
  if (quota < MIN_QUOTA_BYTES) {
    return { kind: 'denied', reason: 'low-quota' };
  }

  // Step 4: persist() grant. Without it the browser is free to evict the
  // zkey under memory pressure mid-proof, which we have no way to recover
  // from. A `false` return means the user (or browser policy) refused.
  const persisted = await storage.persist();
  if (!persisted) {
    return { kind: 'denied', reason: 'persist-denied' };
  }

  // Step 5: optional deviceMemory check. Chrome/Edge/Opera expose this;
  // Safari/Firefox return undefined — skip the check rather than fail
  // them (they get filtered by other gates anyway).
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (typeof deviceMemory === 'number' && deviceMemory < 4) {
    return { kind: 'denied', reason: 'low-ram' };
  }

  return { kind: 'ready', quotaBytes: quota, persistGranted: true };
}

// ---------------------------------------------------------------------------
// V2 civic-terminal capability check (per spec §5.0 + plan Task 8).
//
// Two acceptance paths gate the v2 /register + /account/rotate surfaces:
//   1. ready-browser — Firefox≥120 with `navigator.deviceMemory ≥ 8`
//      (the only browser/RAM combo that survives a ~38 GB-peak full prove).
//   2. ready-cli     — `zkqes serve` detected at localhost:9080 (offloads
//      proving to native rapidsnark; ~14 s, ~3.7 GB peak; works on any
//      browser including Chrome/Safari/in-app webviews).
//
// Replaces V5.0 mobile-flagship-acceptance for civic-terminal v2 surfaces.
// The older `assessDeviceCapability` is intentionally kept exported above —
// the legacy `/ua/use-desktop` flow still calls it during rollout.
// ---------------------------------------------------------------------------

// Note: `assessV2BrowserCapability` only emits `ready-browser` or `denied`.
// The third acceptance path (`ready-cli`) is composed downstream by the
// gate component from `useCliPresence().status === 'present'` — it's not a
// browser-side judgement. Keeping the union here narrow lets the gate's
// switch fall through cleanly without an unused-case branch.
export type V2DeviceCapability =
  | { kind: 'ready-browser'; browser: string; deviceMemory: number }
  | {
      kind: 'denied';
      detected: { browser: string; deviceMemory: number | 'unknown' };
    };

const FIREFOX_RE = /Firefox\/(\d+)/;
const FIREFOX_DERIV_RE = /Seamonkey|PaleMoon|Waterfox/;

/**
 * Synchronous browser-only capability check. Returns a `ready-browser`
 * verdict iff the navigator looks like a real Firefox≥120 with declared
 * `deviceMemory ≥ 8`. Otherwise returns `denied` with a `detected` line
 * suitable for the user-facing fallback panel.
 *
 * The `ready-cli` verdict comes from the CLI presence hook; the gate
 * component composes the two signals.
 */
export function assessV2BrowserCapability(): V2DeviceCapability {
  if (typeof navigator === 'undefined') {
    return {
      kind: 'denied',
      detected: { browser: 'unknown', deviceMemory: 'unknown' },
    };
  }
  const ua = navigator.userAgent ?? '';
  const ffMatch = ua.match(FIREFOX_RE);
  const isFirefox = ffMatch !== null && !FIREFOX_DERIV_RE.test(ua);
  const ffVersion = isFirefox ? Number(ffMatch?.[1] ?? 0) : 0;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;

  if (
    isFirefox &&
    ffVersion >= 120 &&
    typeof deviceMemory === 'number' &&
    deviceMemory >= 8
  ) {
    return {
      kind: 'ready-browser',
      browser: `Firefox ${ffVersion}`,
      deviceMemory,
    };
  }

  // Reject path. The browser label below is for the user-facing Detected
  // line; we don't try to be exhaustive — Chrome/Safari/unknown is enough.
  const browserLabel = isFirefox
    ? `Firefox ${ffVersion}`
    : ua.includes('Chrome/')
      ? 'Chrome (Chromium)'
      : ua.includes('Safari/')
        ? 'Safari'
        : 'unknown browser';
  return {
    kind: 'denied',
    detected: {
      browser: browserLabel,
      deviceMemory: typeof deviceMemory === 'number' ? deviceMemory : 'unknown',
    },
  };
}
