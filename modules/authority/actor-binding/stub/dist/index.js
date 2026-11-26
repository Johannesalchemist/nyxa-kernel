"use strict";
// TEST-ONLY stdio backend. Reports the actor env it was started with and echoes calls.
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const s = new Server({ name: "stub-backend", version: "0.0.1" }, { capabilities: { tools: {} } });
const obj = { type: "object", properties: {}, additionalProperties: true };
s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: "stub_whoami", description: "env", inputSchema: obj },
  { name: "nyxa_propose_action", description: "echo", inputSchema: obj },
] }));
s.setRequestHandler(CallToolRequestSchema, async (req) => ({
  content: [{ type: "text", text: JSON.stringify({
    forwarded: true, tool: req.params.name,
    backend_actor: process.env.NYXA_DEVELOPMENT_ACTOR || null,
    proposal_actor: req.params.arguments && req.params.arguments.proposal ? req.params.arguments.proposal.actor : null,
  }) }],
}));
s.connect(new StdioServerTransport());
