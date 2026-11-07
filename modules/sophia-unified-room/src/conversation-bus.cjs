'use strict';
/**
 * Unified Conversation Bus — one server-side, persistent message stream for text, voice,
 * agent and mail channels.
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 * Guarantees (tested in test/conversation-bus.test.cjs):
 *  - server state is authoritative; a message exists once it is committed here, not when the UI shows it;
 *  - deduplication by message_id (client-generated, idempotent re-send after reconnect);
 *  - total order per conversation via monotonically increasing seq;
 *  - full original text stored content-addressed (content_ref = sha256:...), never truncated;
 *  - context windows mark excerpts explicitly (truncated: true + content_ref), never as originals;
 *  - per-session delivery records with explicit ACK, so the realtime session can be proven to have received a text;
 *  - reconnect = replay of everything after the session's last acked seq.
 */
const { tx, sha256, uuid, canonical, audit } = require('./db.cjs');

const CHANNELS = new Set(['text', 'voice', 'agent', 'mail', 'system']);
const VISIBILITY = new Set(['room', 'private', 'operator']);
const ACTOR_KINDS = new Set(['human', 'agent', 'external', 'system']);

function createBus(db, { clock = () => new Date() } = {}) {
  const now = () => clock().toISOString();

  function putContent(text) {
    if (typeof text !== 'string') throw new TypeError('content text must be a string');
    const ref = 'sha256:' + sha256(text);
    db.prepare(`INSERT OR IGNORE INTO contents (content_ref, byte_length, char_length, text, created_at)
                VALUES (?,?,?,?,?)`).run(ref, Buffer.byteLength(text, 'utf8'), text.length, text, now());
    return ref;
  }

  function getContent(ref) {
    const row = db.prepare('SELECT * FROM contents WHERE content_ref = ?').get(ref);
    if (!row) return null;
    // Integrity check: the stored text must still hash to its reference.
    if ('sha256:' + sha256(row.text) !== ref) throw new Error('content integrity violation for ' + ref);
    return { content_ref: ref, text: row.text, byte_length: row.byte_length, char_length: row.char_length, complete: true };
  }

  function rowToMessage(r) {
    return {
      seq: r.seq, message_id: r.message_id, conversation_id: r.conversation_id, session_id: r.session_id,
      actor_id: r.actor_id, actor_kind: r.actor_kind, channel: r.channel, timestamp: r.timestamp,
      content_ref: r.content_ref, delivery_status: r.delivery_status, visibility: r.visibility,
      provenance: JSON.parse(r.provenance), correlation_id: r.correlation_id, trust: r.trust,
    };
  }

  /**
   * Append a message. `principal` is the authenticated caller (never taken from the body).
   * Mail/external content is stored with trust = 'untrusted_external'.
   */
  function post(principal, input) {
    if (!principal || !principal.id || !ACTOR_KINDS.has(principal.kind)) throw new Error('authenticated principal required');
    const channel = input.channel;
    if (!CHANNELS.has(channel)) throw new Error('invalid channel: ' + channel);
    const visibility = input.visibility || 'room';
    if (!VISIBILITY.has(visibility)) throw new Error('invalid visibility');
    if (!input.conversation_id) throw new Error('conversation_id required');
    const message_id = input.message_id || uuid();
    const trust = channel === 'mail' || principal.kind === 'external' ? 'untrusted_external' : 'trusted_principal';

    return tx(db, () => {
      const existing = db.prepare('SELECT * FROM messages WHERE message_id = ?').get(message_id);
      if (existing) {
        const msg = rowToMessage(existing);
        if (msg.conversation_id !== input.conversation_id) throw new Error('message_id reused across conversations');
        return { ...msg, duplicate: true };
      }
      const content_ref = putContent(input.text);
      const provenance = {
        source_channel: channel,
        principal_id: principal.id,
        principal_kind: principal.kind,
        ...(input.provenance || {}),
      };
      const ts = now();
      const info = db.prepare(`INSERT INTO messages (message_id, conversation_id, session_id, actor_id, actor_kind, channel,
          timestamp, content_ref, delivery_status, visibility, provenance, correlation_id, trust)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(message_id, input.conversation_id, input.session_id || null, principal.id, principal.kind, channel, ts,
          content_ref, 'COMMITTED', visibility, canonical(provenance), input.correlation_id || null, trust);
      // Fan-out delivery records to every open session of the conversation except the originating one.
      const sessions = db.prepare('SELECT session_id FROM sessions WHERE conversation_id = ? AND closed_at IS NULL')
        .all(input.conversation_id);
      for (const s of sessions) {
        if (s.session_id === input.session_id) continue;
        db.prepare(`INSERT OR IGNORE INTO deliveries (message_id, session_id, status, updated_at) VALUES (?,?, 'PENDING', ?)`)
          .run(message_id, s.session_id, ts);
      }
      audit(db, { at: ts, actor: principal.id, action: 'message.post', subject: message_id,
        correlation_id: input.correlation_id || null, detail: { channel, content_ref, seq: Number(info.lastInsertRowid) } });
      return { ...rowToMessage(db.prepare('SELECT * FROM messages WHERE seq = ?').get(info.lastInsertRowid)), duplicate: false };
    });
  }

  function openSession(principal, { session_id = uuid(), conversation_id, channel }) {
    if (!principal || !principal.id) throw new Error('authenticated principal required');
    db.prepare(`INSERT OR IGNORE INTO sessions (session_id, conversation_id, principal_id, channel, opened_at)
                VALUES (?,?,?,?,?)`).run(session_id, conversation_id, principal.id, channel, now());
    const s = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(session_id);
    if (s.principal_id !== principal.id) throw new Error('session belongs to another principal');
    return s;
  }

  function closeSession(session_id) {
    db.prepare('UPDATE sessions SET closed_at = ? WHERE session_id = ?').run(now(), session_id);
  }

  /** Messages after `afterSeq` in conversation order (reconnect / catch-up). */
  function since(conversation_id, afterSeq = 0, limit = 500) {
    return db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND seq > ? ORDER BY seq LIMIT ?')
      .all(conversation_id, afterSeq, limit).map(rowToMessage);
  }

  /** Pending deliveries for one session, in order, with full content attached. */
  function pendingFor(session_id) {
    const rows = db.prepare(`SELECT m.* FROM deliveries d JOIN messages m ON m.message_id = d.message_id
        WHERE d.session_id = ? AND d.status IN ('PENDING','DELIVERED') ORDER BY m.seq`).all(session_id);
    return rows.map(r => ({ ...rowToMessage(r), content: getContent(r.content_ref) }));
  }

  function markDelivered(session_id, message_id) {
    db.prepare(`UPDATE deliveries SET status = 'DELIVERED', attempts = attempts + 1, updated_at = ?
                WHERE session_id = ? AND message_id = ? AND status = 'PENDING'`).run(now(), session_id, message_id);
  }

  /** ACK proves the receiving session confirmed the message (e.g. realtime conversation.item.created). */
  function ack(session_id, message_id, evidence = {}) {
    return tx(db, () => {
      const m = db.prepare('SELECT seq FROM messages WHERE message_id = ?').get(message_id);
      if (!m) throw new Error('unknown message');
      const r = db.prepare(`UPDATE deliveries SET status = 'ACKED', updated_at = ? WHERE session_id = ? AND message_id = ?`)
        .run(now(), session_id, message_id);
      if (r.changes !== 1) throw new Error('no delivery record for this session/message');
      db.prepare('UPDATE sessions SET last_acked_seq = MAX(last_acked_seq, ?) WHERE session_id = ?').run(m.seq, session_id);
      audit(db, { at: now(), actor: session_id, action: 'message.ack', subject: message_id, detail: evidence });
      return true;
    });
  }

  /**
   * Context for a model. Items longer than maxCharsPerItem are excerpted and *explicitly* marked.
   * The model is expected to call a content fetch tool (getContent) with content_ref for the original.
   */
  function contextWindow(conversation_id, { maxItems = 40, maxCharsPerItem = 2000 } = {}) {
    const rows = db.prepare(`SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?)
                             ORDER BY seq`).all(conversation_id, maxItems);
    return rows.map(r => {
      const c = getContent(r.content_ref);
      const truncated = c.text.length > maxCharsPerItem;
      return {
        seq: r.seq, message_id: r.message_id, actor_id: r.actor_id, channel: r.channel, timestamp: r.timestamp,
        trust: r.trust, content_ref: r.content_ref,
        text: truncated ? c.text.slice(0, maxCharsPerItem) : c.text,
        truncated,
        char_length: c.char_length,
        note: truncated ? 'EXCERPT — not the original. Fetch content_ref for the complete text.' : undefined,
      };
    });
  }

  return { post, getContent, putContent, openSession, closeSession, since, pendingFor, markDelivered, ack, contextWindow };
}

module.exports = { createBus };
