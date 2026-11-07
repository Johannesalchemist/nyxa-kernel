'use strict';
/**
 * HTTP surface for The Room (mountable into apps/console/api/server.js under /api/v2/room/*).
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 * Every route requires authentication. Approvals, revocations, executor configuration and manual runs require a
 * human principal. Sophia (agent principal) may submit tasks only on behalf of a verified human token.
 */
const { nextRun } = require('./scheduler.cjs');
const { GovernanceError } = require('./task-queue.cjs');

function createApi({ bus, queue, auth, clock = () => new Date() }) {
  const routes = [];
  const route = (method, path, opts, handler) => routes.push({ method, path, opts, handler });
  const humanOnly = { kinds: ['human'] };

  function visible(principal, m) {
    if (m.visibility === 'room') return true;
    const human = auth.humanOf(principal);
    return !!human && (m.actor_id === human.id || m.provenance?.requested_by === human.id || m.provenance?.principal_id === human.id);
  }

  route('post', '/api/v2/room/messages', {}, (p, { body }) => {
    const channel = body.channel || 'text';
    if (p.kind === 'human' && !['text', 'voice'].includes(channel)) return [400, { ok: false, error: 'humans post text or voice' }];
    if (p.kind === 'agent' && channel !== 'agent' && channel !== 'voice') return [400, { ok: false, error: 'agents post agent or voice (transcript) messages' }];
    const m = bus.post(p, { conversation_id: body.conversation_id, session_id: body.session_id, channel, text: String(body.text ?? ''),
      message_id: body.message_id, visibility: body.visibility, correlation_id: body.correlation_id,
      provenance: p.on_behalf_of ? { on_behalf_of: p.on_behalf_of.id } : undefined });
    return [m.duplicate ? 200 : 201, { ok: true, message: m }];
  });

  route('get', '/api/v2/room/messages', {}, (p, { query }) => {
    const items = bus.since(String(query.conversation_id), Number(query.after || 0)).filter(m => visible(p, m));
    return [200, { ok: true, items }];
  });

  /** Realtime tool `room_content_fetch`: the complete original of a content_ref. */
  route('get', '/api/v2/room/content/:ref', {}, (p, { params }) => {
    const c = bus.getContent(params.ref);
    return c ? [200, { ok: true, ...c }] : [404, { ok: false, error: 'not found' }];
  });

  route('post', '/api/v2/room/sessions', {}, (p, { body }) => [201, { ok: true, session: bus.openSession(auth.humanOf(p) || p, body) }]);
  route('get', '/api/v2/room/sessions/:id/pending', {}, (p, { params }) => [200, { ok: true, items: bus.pendingFor(params.id).filter(m => visible(p, m)) }]);
  route('post', '/api/v2/room/sessions/:id/ack', {}, (p, { params, body }) => { bus.ack(params.id, body.message_id, { realtime_event: body.realtime_event || null }); return [200, { ok: true }]; });

  route('post', '/api/v2/tasks', {}, (p, { body }) => {
    const human = auth.humanOf(p);
    if (!human) return [403, { ok: false, error: 'task submission requires a verified human (directly or on-behalf-of)' }];
    const instruction_ref = body.instruction ? bus.putContent(String(body.instruction)) : body.instruction_ref;
    const t = queue.submit(p, { ...body, instruction_ref, requested_by: human });
    return [t.duplicate ? 200 : 201, { ok: true, task: t }];
  });

  route('get', '/api/v2/tasks', {}, (p, { query }) => [200, { ok: true, tasks: queue.list({ status: query.status, executor: query.executor }) }]);

  for (const action of ['approve', 'deny', 'revoke', 'cancel']) {
    route('post', `/api/v2/tasks/:id/${action}`, humanOnly, (p, { params, body }) => {
      const t = action === 'approve' ? queue.approve(p, params.id, { scope_hash: body.scope_hash })
        : action === 'deny' ? queue.deny(p, params.id, { reason: body.reason })
          : action === 'revoke' ? queue.revoke(p, params.id, body.reason) : queue.cancel(p, params.id, body.reason);
      return [200, { ok: true, task: t }];
    });
  }

  route('post', '/api/v2/tasks/:id/verify', {}, (p, { params, body }) => [200, { ok: true, task: queue.verify(p, params.id, body) }]);
  route('get', '/api/v2/tasks/:id/audit', humanOnly, (p, { params }) => { const t = queue.get(params.id); return t ? [200, { ok: true, audit: queue.auditTrail(t.correlation_id) }] : [404, { ok: false }]; });

  route('get', '/api/v2/executors/:id', {}, (p, { params }) => {
    const c = queue.executorConfig(params.id);
    if (!c) return [404, { ok: false, error: 'not configured' }];
    const n = nextRun(c, clock().getTime());
    return [200, { ok: true, config: c, next_run: n ? new Date(n).toISOString() : null }];
  });
  route('put', '/api/v2/executors/:id', humanOnly, (p, { params, body }) => [200, { ok: true, config: queue.configureExecutor(p, { ...body, executor: params.id }) }]);

  /** Compact status for Sophia to explain in speech without reading long lists. */
  route('get', '/api/v2/status/summary', {}, () => {
    const all = queue.list();
    const count = s => all.filter(t => t.status === s).length;
    return [200, { ok: true, summary: {
      pending_approval: count('PENDING_APPROVAL'), running: count('RUNNING') + count('CLAIMED'), awaiting_verification: count('RESULT_RECORDED'),
      escalated: count('ESCALATED'), failed: count('FAILED'), denied: count('DENIED'), completed_verified: count('COMPLETED'),
    } }];
  });

  function invoke(r, req) {
    try {
      const [status, body] = r.handler(req.principal, { body: req.body || {}, query: req.query || {}, params: req.params || {} });
      return [status, body];
    } catch (e) {
      if (e instanceof GovernanceError) return [e.code === 'NOT_AUTHORIZED' ? 403 : e.code === 'NOT_FOUND' ? 404 : 409, { ok: false, error: e.code }];
      return [400, { ok: false, error: String(e.message).slice(0, 200) }];
    }
  }

  function mount(app, json) {
    for (const r of routes) {
      const handlers = [auth.require(r.opts)];
      if (json) handlers.unshift(json);
      app[r.method](r.path, ...handlers, (req, res) => { const [s, b] = invoke(r, req); res.status(s).json(b); });
    }
  }

  return { routes, invoke, mount };
}

module.exports = { createApi };
