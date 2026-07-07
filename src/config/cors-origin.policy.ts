/**
 * CORS is deliberately permissive here — it is NOT the security boundary
 * for this API. tracker.js runs in the browser of arbitrary customer
 * websites, so a fixed allow-list would block legitimate traffic; real
 * authorization is API Key -> Project -> Workspace -> Domain Validation
 * (TrackerService.assertDomainAllowed, inside the ingestion pipeline) and
 * ProjectRateLimitGuard, none of which CORS can substitute for. See
 * docs/SECURITY.md for the full reasoning.
 *
 * Structured so a future global origin allow-list can be enabled purely
 * via GLOBAL_ORIGIN_WHITELIST (CSV of hostnames) without touching this
 * function's signature or how it's wired in main.ts. Empty/unset
 * whitelist (the default) reflects any origin, unchanged behavior.
 */
export function resolveCorsOrigin(
  globalOriginWhitelist: string[],
): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  return (origin, callback) => {
    if (globalOriginWhitelist.length === 0 || !origin) {
      callback(null, true);
      return;
    }
    let hostname: string | null = null;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = null;
    }
    callback(null, hostname ? globalOriginWhitelist.includes(hostname) : false);
  };
}
