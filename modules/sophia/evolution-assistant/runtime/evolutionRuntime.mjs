/**
 * Runtime adapter (F9): identity-bound HTTP handlers + one-shot heartbeat job for the existing Sophia
 * systemd timers. 2026-11-27 Europe/Berlin, Owner Johannes Suess, generated with Claude Code. NOT deployed.
 * Storage is injected by the host (`store`): load/save of the participant's snapshot and submitCandidate()
 * into the EXISTING governed candidate store. This adapter keeps no store of its own.
 */
import { DevelopmentModel, heartbeatTick } from "../evolutionAssistant.mjs";
import { DecisionLedger, InitiativeCalibration } from "../evolutionExtensions.mjs";

export function restore(principal, snap) {
  const m = new DevelopmentModel(principal); const L = new DecisionLedger(); const ic = new InitiativeCalibration();
  if (snap) { Object.assign(m, { entries: snap.model.entries, goals: snap.model.goals, log: snap.model.log }); L.items = snap.ledger ?? []; for (const [k, v] of snap.initiative ?? []) ic.s.set(k, v); }
  return { model: m, ledger: L, initiative: ic, lastContactAt: snap?.lastContactAt ?? null };
}
export const persistable = (st) => ({ model: { entries: st.model.entries, goals: st.model.goals, log: st.model.log }, ledger: st.ledger.items, initiative: [...st.initiative.s], lastContactAt: st.lastContactAt });

/** Handlers take an already AUTHENTICATED principal (from requireBoundIdentity) — never a Room name. */
export function createHandlers({ identity, store, now = () => Date.now() }) {
  const own = (auth, owner) => identity.authorizePersonal(auth, owner);
  return {
    async view(auth, { owner }) {
      const z = own(auth, owner); if (!z.ok) return { status: 403, body: { error: z.reason } };
      const st = restore(owner, await store.load(owner));
      return { status: 200, body: { model: st.model.view(), decisions: st.ledger.items.map((x) => ({ id: x.id, title: x.p.title, status: x.status })) } };
    },
    async decide(auth, { owner, id, verdict, never, reason }) {
      const z = own(auth, owner); if (!z.ok) return { status: 403, body: { error: z.reason } };
      const st = restore(owner, await store.load(owner));
      try { st.ledger.decide(id, { by: "human", verdict, never: !!never, reason, now: now() }); } catch (e) { return { status: 409, body: { error: e.code ?? e.message } }; }
      st.initiative.record("proposal_delivery", { welcomed: verdict === "accept" || verdict === "defer" });
      await store.save(owner, persistable(st)); return { status: 200, body: { id, status: st.ledger.get(id).status } };
    },
    async object(auth, { owner, entryId }) {
      const z = own(auth, owner); if (!z.ok) return { status: 403, body: { error: z.reason } };
      const st = restore(owner, await store.load(owner)); st.model.object(entryId, { by: "human" }); await store.save(owner, persistable(st));
      return { status: 200, body: { entryId, status: "objected" } };
    },
  };
}

/**
 * One-shot heartbeat for the existing Sophia timer: per participant, reflect and decide on silence vs.
 * a prepared (not sent) message. Outputs candidate proposals only; never contacts anyone.
 */
export async function heartbeatJob({ store, participants, now = Date.now() }) {
  const out = [];
  for (const p of participants) {
    const st = restore(p, await store.load(p));
    const proposals = st.ledger.items.filter((x) => x.status === "awaiting_decision").map((x) => ({ ...x.p, status: "proposed" }));
    const tick = heartbeatTick({ now, lastContactAt: st.lastContactAt, proposals, openQuestions: [] });
    const cal = st.initiative.shouldInitiate("proposal_delivery");
    const communicate = tick.communicate && cal.initiate;
    if (communicate) await store.submitCandidate({ target: "memory:/candidate", payload: { candidate_type: "decision", scope: "personal", source: "agent",
      content: `prepared, not sent: ${tick.message.proposalId}`, purpose: "sophia-evolution:heartbeat", confidence: 0.5, importance: 0.4 } });
    out.push({ participant: p, outcome: communicate ? "prepare_message" : tick.outcome === "prepare_message" ? "silence_by_calibration" : tick.outcome, calibration: cal.reason, externalActions: [] });
  }
  return out;
}
