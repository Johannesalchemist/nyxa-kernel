'use strict';
/**
 * Provider-neutral, governed mail functions for Sophia.
 *   mail.search, mail.read, mail.thread, mail.draft, mail.approval_request, mail.send_approved
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 * Rules:
 *  M1 Mail content is untrusted external data. It is stored on the bus with trust = untrusted_external and is
 *     never interpreted as instruction. No function here takes "instructions" from mail content.
 *  M2 An alias is not a mailbox. Every call names an explicitly configured mailbox binding; unknown → DENY.
 *  M3 Sending requires: draft → approval_request (task with payload_hash) → explicit human approval →
 *     re-fetch draft + recipient/content re-check (hash must match) → single send (stable effect_key) →
 *     provider confirmation (message id). Missing confirmation ⇒ UNKNOWN ⇒ ESCALATED, never auto-resend.
 *  M4 No automatic external send on model decision: send_approved requires a lease on an APPROVED task
 *     whose approval was given by a human (mandates cannot cover mail.send_approved).
 *
 * Provider adapter interface (implement per provider: Gmail API, IMAP+SMTP, ...):
 *   search(mailbox, query, limit) → [{id, thread_id, from, to, cc, date, subject, snippet}]
 *   getMessage(mailbox, id)       → {id, thread_id, from, to, cc, date, subject, text, message_id_header}
 *   getThread(mailbox, thread_id) → {thread_id, messages: [getMessage-shape...]}
 *   createDraft(mailbox, {to, cc, subject, text, in_reply_to, thread_id}) → {draft_id}
 *   getDraft(mailbox, draft_id)   → {draft_id, to, cc, subject, text, thread_id}
 *   sendDraft(mailbox, draft_id)  → {provider_message_id}
 */
const { canonical, sha256 } = require('./db.cjs');

function payloadHash(d) {
  const norm = a => [...(a || [])].map(x => String(x).trim().toLowerCase()).sort();
  return sha256(canonical({ to: norm(d.to), cc: norm(d.cc), subject: String(d.subject || ''), text: String(d.text || ''), thread_id: d.thread_id || null }));
}

/**
 * @param o.provider        adapter (see above)
 * @param o.bindings        { [mailbox]: { owner_id, allowed_principals: [ids], sender_identity, provider_account } }
 * @param o.bus, o.queue
 */
function createMailGate({ provider, bindings, bus, queue }) {
  function binding(principal, mailbox) {
    const b = bindings[mailbox];
    if (!b) return { ok: false, reason: 'MAILBOX_NOT_BOUND' };
    if (!principal || !b.allowed_principals.includes(principal.id)) return { ok: false, reason: 'PRINCIPAL_NOT_AUTHORIZED_FOR_MAILBOX' };
    return { ok: true, b };
  }

  function ingest(principal, conversation_id, msg, mailbox) {
    const text = [`From: ${msg.from}`, `To: ${(msg.to || []).join(', ')}`, msg.cc?.length ? `Cc: ${msg.cc.join(', ')}` : null,
      `Date: ${msg.date}`, `Subject: ${msg.subject}`, '', msg.text].filter(x => x !== null).join('\n');
    const content_ref = bus.putContent(text);
    if (conversation_id) {
      bus.post({ id: 'mail:' + mailbox, kind: 'external' }, {
        conversation_id, channel: 'mail', text, message_id: `mail:${mailbox}:${msg.id}`, visibility: 'private',
        provenance: { mailbox, provider_message_id: msg.id, thread_id: msg.thread_id, requested_by: principal.id },
      });
    }
    return { id: msg.id, thread_id: msg.thread_id, from: msg.from, to: msg.to, cc: msg.cc || [], date: msg.date, subject: msg.subject,
      content_ref, trust: 'untrusted_external', source: { mailbox, provider: provider.name || 'unknown' } };
  }

  async function search(principal, { mailbox, query, limit = 10 }) {
    const g = binding(principal, mailbox); if (!g.ok) return { ok: false, decision: 'DENY', reason: g.reason };
    const items = await provider.search(mailbox, String(query), Math.min(limit, 50));
    return { ok: true, trust: 'untrusted_external', items: items.map(i => ({ ...i, trust: 'untrusted_external' })) };
  }

  async function read(principal, { mailbox, id, conversation_id }) {
    const g = binding(principal, mailbox); if (!g.ok) return { ok: false, decision: 'DENY', reason: g.reason };
    return { ok: true, message: ingest(principal, conversation_id, await provider.getMessage(mailbox, id), mailbox) };
  }

  async function thread(principal, { mailbox, thread_id, conversation_id }) {
    const g = binding(principal, mailbox); if (!g.ok) return { ok: false, decision: 'DENY', reason: g.reason };
    const t = await provider.getThread(mailbox, thread_id);
    const messages = [...t.messages].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(m => ingest(principal, conversation_id, m, mailbox));
    return { ok: true, thread_id, messages, ordered_by: 'date_asc', source: { mailbox } };
  }

  /** Draft creation is allowed (no external effect) but recorded. Never sends. */
  async function draft(principal, { mailbox, to, cc = [], subject, text, thread_id = null, in_reply_to = null }) {
    const g = binding(principal, mailbox); if (!g.ok) return { ok: false, decision: 'DENY', reason: g.reason };
    if (!Array.isArray(to) || !to.length) return { ok: false, reason: 'RECIPIENT_REQUIRED' };
    const d = await provider.createDraft(mailbox, { to, cc, subject, text, thread_id, in_reply_to });
    return { ok: true, draft_id: d.draft_id, payload_hash: payloadHash({ to, cc, subject, text, thread_id }), sent: false };
  }

  /** Creates a task that only a human can approve. Mandates cannot cover it (consequential operation). */
  async function approvalRequest(creator, { requested_by, mailbox, draft_id, conversation_id, correlation_id }) {
    const g = binding(requested_by, mailbox); if (!g.ok) return { ok: false, decision: 'DENY', reason: g.reason };
    const d = await provider.getDraft(mailbox, draft_id);
    const hash = payloadHash(d);
    const preview = bus.putContent(`An: ${d.to.join(', ')}${d.cc?.length ? '\nCc: ' + d.cc.join(', ') : ''}\nBetreff: ${d.subject}\n\n${d.text}`);
    const task = queue.submit(creator, {
      requested_by, executor: 'mail', task_type: 'mail_send', idempotency_key: `mail_send:${mailbox}:${draft_id}:${hash}`,
      scope: { resources: [`mailbox:${mailbox}`, `draft:${draft_id}`, `payload:${hash}`], allowed_operations: ['mail.send_approved'] },
      context_refs: [preview], conversation_id, correlation_id, cost_budget_cents: 0, max_attempts: 1,
    });
    return { ok: true, task_id: task.task_id, status: task.status, scope_hash: task.scope_hash, payload_hash: hash, preview_ref: preview };
  }

  /**
   * Sends exactly the approved draft. Called by the mail worker after claim().
   * Re-fetches the draft and compares recipients + content with the approved payload hash.
   */
  async function sendApproved({ task_id, lease_token }) {
    const t = queue.get(task_id);
    if (!t || t.task_type !== 'mail_send') return { ok: false, decision: 'DENY', reason: 'NOT_A_MAIL_TASK' };
    const res = Object.fromEntries(t.scope.resources.map(r => { const i = r.indexOf(':'); return [r.slice(0, i), r.slice(i + 1)]; }));
    const d = await provider.getDraft(res.mailbox, res.draft);
    if (payloadHash(d) !== res.payload) {
      queue.fail(task_id, lease_token, { error: 'PAYLOAD_CHANGED_AFTER_APPROVAL', retryable: false });
      return { ok: false, decision: 'DENY', reason: 'PAYLOAD_CHANGED_AFTER_APPROVAL' };
    }
    const effect_key = `${task_id}:mail.send_approved`;           // stable: one send per task, ever
    const gate = queue.authorizeEffect(task_id, lease_token, { operation: 'mail.send_approved', resource: `mailbox:${res.mailbox}`, effect_key });
    if (!gate.allowed) return { ok: false, decision: 'DENY', reason: gate.reason, replay: !!gate.replay };
    let out;
    try { out = await provider.sendDraft(res.mailbox, res.draft); } catch (e) {
      // We cannot know whether the provider accepted it. Do not retry; escalate.
      queue.recordEffect(effect_key, 'UNKNOWN', { error: String(e.message).slice(0, 200) });
      queue.fail(task_id, lease_token, { error: 'SEND_OUTCOME_UNKNOWN' });
      return { ok: false, decision: 'ESCALATE', reason: 'SEND_OUTCOME_UNKNOWN' };
    }
    if (!out || !out.provider_message_id) {
      queue.recordEffect(effect_key, 'UNKNOWN', { note: 'no provider confirmation' });
      queue.fail(task_id, lease_token, { error: 'NO_PROVIDER_CONFIRMATION' });
      return { ok: false, decision: 'ESCALATE', reason: 'NO_PROVIDER_CONFIRMATION' };
    }
    queue.recordEffect(effect_key, 'CONFIRMED', { provider_message_id: out.provider_message_id });
    queue.recordResult(task_id, lease_token, {
      result_ref: bus.putContent(`sent provider_message_id=${out.provider_message_id}`),
      provenance: { executor: 'mail', model: 'n/a', provider: provider.name || 'unknown', provider_message_id: out.provider_message_id },
    });
    return { ok: true, provider_message_id: out.provider_message_id, status: 'RESULT_RECORDED' };
  }

  return { search, read, thread, draft, approvalRequest, sendApproved, payloadHash };
}

module.exports = { createMailGate, payloadHash };
