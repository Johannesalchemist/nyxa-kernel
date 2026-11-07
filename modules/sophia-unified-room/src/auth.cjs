'use strict';
/**
 * Principal resolution for Room and delegation endpoints.
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 * - No identity is hard-coded. Humans come from verified tokens; agents/services from separately issued service tokens.
 * - Agent principals never inherit a human's rights: an internal call made by Sophia on behalf of a human carries
 *   BOTH the agent principal (actor) and the human principal (on_behalf_of), and every gate decides on the
 *   intersection, never the union.
 * - Unknown/invalid credentials ⇒ 401. Missing role ⇒ 403. There is no anonymous fallback.
 */

/**
 * @param verifyHuman   (token) => {id, roles?} | null  e.g. wraps jwt.verify(token, JWT_SECRET)
 * @param verifyService (token) => {id, kind: 'agent'|'service', roles?} | null  e.g. HMAC-checked service token
 */
function createAuth({ verifyHuman, verifyService }) {
  function bearer(req) {
    const h = req.headers?.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  }

  function resolve(req) {
    const token = bearer(req);
    if (!token) return null;
    try {
      const svc = verifyService && verifyService(token);
      if (svc && svc.id) {
        // On-behalf-of must itself be a verified human token, forwarded explicitly — never a name in the body.
        const obo = req.headers?.['x-nyxa-on-behalf-of'];
        const human = obo && verifyHuman ? verifyHuman(String(obo)) : null;
        return { id: svc.id, kind: svc.kind || 'service', roles: svc.roles || [], on_behalf_of: human ? { id: human.id, kind: 'human', roles: human.roles || [] } : null };
      }
      const h = verifyHuman && verifyHuman(token);
      if (h && h.id) return { id: h.id, kind: 'human', roles: h.roles || [] };
    } catch { /* invalid token */ }
    return null;
  }

  function require_(opts = {}) {
    return (req, res, next) => {
      const p = resolve(req);
      if (!p) return res.status(401).json({ ok: false, error: 'Unauthorized' });
      if (opts.kinds && !opts.kinds.includes(p.kind)) return res.status(403).json({ ok: false, error: 'Forbidden' });
      if (opts.role && !(p.roles || []).includes(opts.role)) return res.status(403).json({ ok: false, error: 'Forbidden' });
      req.principal = p;
      next();
    };
  }

  /** The human a request ultimately acts for (direct human or verified on-behalf-of). */
  function humanOf(p) { return p?.kind === 'human' ? p : p?.on_behalf_of || null; }

  return { resolve, require: require_, humanOf };
}

/** Approver policy factory: approvers come from configuration (e.g. env NYXA_APPROVER_IDS), never from code. */
function approverPolicyFrom(ids) {
  const set = new Set((ids || []).map(String).filter(Boolean));
  return (principal) => !!principal && principal.kind === 'human' && set.has(String(principal.id));
}

module.exports = { createAuth, approverPolicyFrom };
