import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import * as O from "./oauthResourceServer.mjs";

const RES = "https://mcp.example.test/mcp", ISS = "https://auth.example.test";
const es = generateKeyPairSync("ec", { namedCurve: "P-256" }), other = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = { ...es.publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256" };
const jwks = { keys: [jwk] }; let fetches = 0;
const resolveKey = O.jwksResolver({ jwksUri: ISS + "/jwks.json", fetchJson: async () => { fetches++; return jwks; } });
const NOW = 1795000000;
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mint = (claims = {}, { key = es.privateKey, header = { alg: "ES256", kid: "k1", typ: "at+jwt" } } = {}) => {
  const h = b(header), p = b({ iss: ISS, aud: RES, sub: "user:johannes", client_id: "claude-web", scope: "nyxa.read nyxa.propose",
    iat: NOW - 10, exp: NOW + 600, jti: "j-" + Math.random(), ...claims });
  const s = sign("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${h}.${p}.${s}`;
};
const revoked = new Set(["j-revoked"]);
const cfg = { resource: RES, issuer: ISS, trustedProxies: ["127.0.0.1"], allowDirect: false, allowedOrigins: ["https://claude.ai", "https://chatgpt.com"],
  allowedClients: ["claude-web", "chatgpt-web"], requiredScopes: ["nyxa.read"], scopesSupported: ["nyxa.read", "nyxa.propose"],
  maxTokenLifetimeSeconds: 3600, isRevoked: async (j) => revoked.has(j) };
const req = (token, h = {}, ip = "127.0.0.1") => ({ remoteAddress: ip, headers: { "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.5",
  ...(token ? { authorization: "Bearer " + token } : {}), ...h } });
const A = (r) => O.authenticateRequest(r, cfg, resolveKey, NOW);

test("ALLOW: valid token via trusted TLS proxy; principal is oauth_web, never agent-attested, no authority", async () => {
  const r = await A(req(mint(), { origin: "https://claude.ai" }));
  assert.equal(r.ok, true); assert.equal(r.principal.transport, "oauth_web");
  assert.equal(r.principal.agentAttested, false); assert.equal(r.principal.authorityGranted, false);
});

test("DENY matrix: audience, issuer, expiry, nbf, lifetime, client, scope, revocation, signature, alg, key", async () => {
  const cases = [
    [mint({ aud: "https://other.example.test/mcp" }), 401, "audience mismatch (token not issued for this resource)"],
    [mint({ iss: "https://evil.example.test" }), 401, "issuer mismatch"],
    [mint({ exp: NOW - 100 }), 401, "expired"],
    [mint({ nbf: NOW + 300 }), 401, "not yet valid"],
    [mint({ iat: NOW - 10, exp: NOW + 86400 }), 401, "lifetime too long"],
    [mint({ client_id: "unknown-client" }), 403, "client not allowed"],
    [mint({ scope: "nyxa.propose" }), 403, "missing scope nyxa.read"],
    [mint({ jti: "j-revoked" }), 401, "token revoked"],
    [mint({}, { key: other.privateKey }), 401, "bad signature"],
    [mint({}, { header: { alg: "none", kid: "k1" } }), 401, "algorithm or kid not allowed"],
    [mint({}, { header: { alg: "HS256", kid: "k1" } }), 401, "algorithm or kid not allowed"],
    [mint({}, { header: { alg: "ES256", kid: "k-unknown" } }), 401, "unknown signing key"],
  ];
  for (const [t, status, desc] of cases) { const r = await A(req(t)); assert.equal(r.ok, false, desc); assert.equal(r.status, status, desc); assert.equal(r.description, desc); }
});

test("transport: proxy trust, TLS, direct access, origin, token location", async () => {
  assert.equal((await A(req(mint(), {}, "100.64.0.9"))).description, "forwarded headers from untrusted peer");
  assert.equal((await A(req(mint(), { "x-forwarded-proto": "http" }))).description, "TLS required at proxy");
  assert.equal((await A({ remoteAddress: "100.64.0.9", headers: { authorization: "Bearer " + mint() } })).description, "direct access not allowed on this route");
  assert.equal((await A(req(mint(), { origin: "https://evil.example.test" }))).status, 403);
  assert.equal((await A(req(null))).status, 401);
  assert.equal((await A(req(null, { authorization: "Basic abc" }))).error, "invalid_token");
});

test("metadata + challenge per RFC 9728 / RFC 6750; JWKS cached", async () => {
  assert.deepEqual(O.protectedResourceMetadata(cfg).authorization_servers, [ISS]);
  assert.equal(O.wwwAuthenticate(cfg, { error: "invalid_token" }),
    'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp", scope="nyxa.read", error="invalid_token"');
  assert.equal(O.metadataUrl("https://mcp.example.test/"), "https://mcp.example.test/.well-known/oauth-protected-resource");
  const before = fetches; await A(req(mint())); await A(req(mint())); assert.equal(fetches, before, "no refetch for known kid");
  assert.throws(() => O.jwksResolver({ jwksUri: "http://x/jwks", fetchJson: async () => ({}) }), /https/);
});
