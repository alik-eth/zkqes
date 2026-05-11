// Origin-pin gate for the localhost prove API.
//
// `allowedOrigin` is a comma-separated allowlist; `/prove` accepts a
// request iff the request's `Origin` is a member. Default covers the
// prod app + the two canonical Vite ports for local dev:
//
//   https://app.zkqes.org,http://localhost:5173,http://localhost:4173
//
// `/status` is exempt — it must be probable from any origin so the
// browser-side detection works regardless of which host the SPA is
// served from.
//
// Empty Origin (e.g., curl smoke from CLI without -H "Origin: …") is
// treated as exempt for the same reason as /status — it can't be a
// hostile browser request.  The threat model is "browser tab on a
// different origin," and browsers always set Origin on cross-origin
// fetches.

export interface OriginGateInput {
  readonly url: string | undefined;
  readonly origin: string;
  readonly allowedOrigin: string;
}

export interface OriginGateResult {
  readonly allowed: boolean;
  readonly reason?: 'origin-mismatch';
}

const STATUS_PATHS = new Set(['/status']);

function parseAllowlist(allowedOrigin: string): string[] {
  return allowedOrigin
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function originGate(input: OriginGateInput): OriginGateResult {
  const { url, origin, allowedOrigin } = input;
  if (url !== undefined && STATUS_PATHS.has(url)) return { allowed: true };
  if (origin === '') return { allowed: true };
  if (parseAllowlist(allowedOrigin).includes(origin)) return { allowed: true };
  return { allowed: false, reason: 'origin-mismatch' };
}

export function originRejectionPayload(
  origin: string,
  allowedOrigin: string,
): { error: string; allowed: string; got: string } {
  return { error: 'origin not allowed', allowed: allowedOrigin, got: origin };
}

export function corsHeaders(
  origin: string,
  allowedOrigin: string,
): Record<string, string> {
  // Echo back the Origin only on a match, never `*`.  A wildcard echo
  // would defeat the origin pin from the browser's CORS-check standpoint
  // (browser would accept the response cross-origin even though the
  // helper rejected the underlying request).  Empty string when no
  // match — browser then refuses to expose the response to JS.
  const match = parseAllowlist(allowedOrigin).includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': match,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true', // Chrome 117+ PNA
    'Access-Control-Allow-Local-Network': 'true',   // Firefox 128+ LNA (W3C spec rename)
    Vary: 'Origin',
  };
}
