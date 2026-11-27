/**
 * NYXA MCP OAuth 2.1 Resource Server guard (P0 Transport & OAuth, Continuation R3).
 * 2026-11-27 Europe/Berlin. Owner: Johannes Suess. Generated with Claude Code. DRAFT / NOT DEPLOYED.
 *
 * For EXTERNAL web MCP clients (Claude web connector, ChatGPT) reaching NYXA over HTTPS.
 * Logically separate from:
 *   - tailnet_direct  : WireGuard node identity (actor binding)        -> transport identity
 *   - agent_attested  : Ed25519 agent passport signature per proposal   -> agent identity
 *   - oauth_web       : OAuth access token for a client acting for a USER -> delegated user access
 * An OAuth token is NEVER mapped to an agent passport and never satisfies agent attestation.
 * It carries no NYXA authority by itself: mandates, gamma and Human Gate still decide effects.
 *
 * Checks: TLS-terminating proxy trust (forwarded headers only from configured proxy addresses),
 * Origin allowlist, Bearer token in header only, JWS alg allowlist (no none/HS*), kid->JWKS,
 * iss exact, aud == canonical resource URI (RFC 8707), exp/nbf/iat with skew, required scopes,
 * client allowlist, jti revocation list. Builds RFC 9728 metadata and RFC 6750 challenges.
 * The received token is NEVER forwarded to the governed backend or any upstream (MCP: MUST NOT pass
 * through); callers pass only the frozen principal.
 */
import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const ALGS = { ES256: { hash: "sha256", dsa: "ieee-p1363" }, EdDSA: { hash: null }, RS256: { hash: "sha256" }, PS256: { hash: "sha256", pss: true } };
const b64u = (s) => Buffer.from(s, "base64url");
const deny = (status, error, description, extra = {}) => ({ ok: false, status, error, description, ...extra });

export function protectedResourceMetadata(cfg) {
  return { resource: cfg.resource, authorization_servers: [cfg.issuer], scopes_supported: cfg.scopesSupported,
    bearer_methods_supported: ["header"], resource_name: cfg.resourceName ?? "NYXA MCP" };
}
/** MCP 2026-07-28 discovery: metadata lives at the ORIGIN, with the endpoint path appended. */
export function metadataUrl(resource) {
  const u = new URL(resource); const path = u.pathname.replace(/\/$/, "");
  return `${u.origin}/.well-known/oauth-protected-resource${path}`;
}
export function wwwAuthenticate(cfg, err) {
  const parts = [`Bearer resource_metadata="${metadataUrl(cfg.resource)}"`];
  if (cfg.requiredScopes?.length) parts.push(`scope="${cfg.requiredScopes.join(" ")}"`);
  if (err?.error) parts.push(`error="${err.error}"`);
  return parts.join(", ");
}

/** JWKS cache with injected fetcher (HTTPS issuer only); kid must be present. */
export function jwksResolver({ jwksUri, fetchJson, ttlMs = 300000, now = () => Date.now() }) {
  if (!/^https:\/\//.test(jwksUri)) throw Error("jwks_uri_must_be_https");
  let cache = null;
  return async (kid) => {
    if (!cache || now() - cache.at > ttlMs || !cache.keys.has(kid)) {
      const doc = await fetchJson(jwksUri);
      cache = { at: now(), keys: new Map((doc.keys ?? []).filter((k) => k.kid).map((k) => [k.kid, k])) };
    }
    return cache.keys.get(kid) ?? null;
  };
}

function verifyJws(token, jwk) {
  const [h, p, s] = token.split(".");
  const header = JSON.parse(b64u(h)); const spec = ALGS[header.alg];
  if (!spec || header.alg !== jwk.alg && jwk.alg) return false;
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const opts = spec.dsa ? { key, dsaEncoding: spec.dsa } : spec.pss ? { key, padding: 6, saltLength: 32 } : key;
  return cryptoVerify(spec.hash, Buffer.from(`${h}.${p}`), opts, b64u(s));
}

/**
 * Authenticate one HTTP request. `req` = { headers (lower-case), remoteAddress, method }.
 * Returns { ok:true, principal:{ transport:"oauth_web", sub, clientId, scopes, jti } } or a denial
 * with HTTP status + RFC 6750 error.
 */
export async function authenticateRequest(req, cfg, resolveKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  // 1. Proxy trust: forwarded headers are honoured only from configured TLS-terminating proxies.
  const fwd = ["forwarded", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host"].some((h) => req.headers[h] !== undefined);
  const fromProxy = cfg.trustedProxies.includes(req.remoteAddress);
  if (fwd && !fromProxy) return deny(400, "invalid_request", "forwarded headers from untrusted peer");
  if (fromProxy && req.headers["x-forwarded-proto"] !== "https") return deny(400, "invalid_request", "TLS required at proxy");
  if (!fromProxy && !cfg.allowDirect) return deny(403, "invalid_request", "direct access not allowed on this route");
  // 2. Origin (MCP Streamable HTTP: servers MUST validate Origin when present).
  const origin = req.headers.origin;
  if (origin !== undefined && !cfg.allowedOrigins.includes(origin)) return deny(403, "invalid_request", "origin not allowed");
  // 3. Bearer token in Authorization header only (no query string tokens).
  const auth = req.headers.authorization ?? "";
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(auth);
  if (!m) return deny(401, "invalid_token", "missing bearer token");
  const token = m[1];
  let header, claims;
  try { header = JSON.parse(b64u(token.split(".")[0])); claims = JSON.parse(b64u(token.split(".")[1])); }
  catch { return deny(401, "invalid_token", "malformed token"); }
  if (!ALGS[header.alg] || typeof header.kid !== "string") return deny(401, "invalid_token", "algorithm or kid not allowed");
  const jwk = await resolveKey(header.kid).catch(() => null);
  if (!jwk) return deny(401, "invalid_token", "unknown signing key");
  let sigOk = false; try { sigOk = verifyJws(token, jwk); } catch { sigOk = false; }
  if (!sigOk) return deny(401, "invalid_token", "bad signature");
  // 4. Claims.
  const skew = cfg.clockSkewSeconds ?? 30;
  if (claims.iss !== cfg.issuer) return deny(401, "invalid_token", "issuer mismatch");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.resource)) return deny(401, "invalid_token", "audience mismatch (token not issued for this resource)");
  if (!Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds - skew) return deny(401, "invalid_token", "expired");
  if (claims.nbf !== undefined && claims.nbf > nowSeconds + skew) return deny(401, "invalid_token", "not yet valid");
  if (claims.iat !== undefined && claims.iat > nowSeconds + skew) return deny(401, "invalid_token", "issued in future");
  if (cfg.maxTokenLifetimeSeconds && claims.iat !== undefined && claims.exp - claims.iat > cfg.maxTokenLifetimeSeconds)
    return deny(401, "invalid_token", "lifetime too long");
  const clientId = claims.client_id ?? claims.azp;
  if (!cfg.allowedClients.includes(clientId)) return deny(403, "invalid_token", "client not allowed");
  if (claims.jti && await cfg.isRevoked?.(claims.jti)) return deny(401, "invalid_token", "token revoked");
  const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : [];
  const missing = (cfg.requiredScopes ?? []).filter((s) => !scopes.includes(s));
  if (missing.length) return deny(403, "insufficient_scope", "missing scope " + missing.join(" "));
  return { ok: true, principal: Object.freeze({ transport: "oauth_web", sub: claims.sub, clientId, scopes, jti: claims.jti,
    agentAttested: false, authorityGranted: false }) };
}
