// Read-only discovery through the existing pinned issuer IPC client (same transport and checks as issuerRequest).
import { execFile } from "node:child_process"; import { promisify } from "node:util";
const run = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function discover(proposalId, { client = "/opt/nyxa-authority-v1/issuer_ipc_client.py", config = "/opt/nyxa-authority-v1/client.json" } = {}) {
  if (!UUID.test(proposalId)) return { ok: false, reason: "proposal_id_invalid" };
  let stdout;
  try { ({ stdout } = await run("/usr/bin/python3", ["-I", "-B", client, "--config", config, "--mode", "discover", "--operation-id", "nyxa-delegation-frame-v2", "--grant-id", proposalId],
    { timeout: 6000, maxBuffer: 8192, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } })); }
  catch (e) { if (e.code !== 2 || !e.stdout) return { ok: false, reason: e.killed ? "issuer_transport_timeout" : "issuer_transport_unavailable" }; stdout = e.stdout; }
  let a; try { a = JSON.parse(stdout); } catch { return { ok: false, reason: "issuer_protocol_invalid" }; }
  if (a?.ok === true && UUID.test(a.grant_id) && a.proposal_id === proposalId) return a;
  return { ok: false, reason: /^DENY:[a-z0-9_]{1,80}$/.test(a?.reason ?? "") ? a.reason : "issuer_protocol_invalid" };
}
