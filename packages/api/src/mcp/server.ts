/**
 * The MCP surface — Klorn's inbox as Model Context Protocol tools, built on
 * the assistant chat's LOCKED-DOWN toolset and then narrowed further:
 * create_event is excluded too (chat intercepts it into a review card; MCP
 * has no review surface), so everything reachable here is read-only or
 * LOW-risk (one bounded exception: generate_briefing may create the day's
 * briefing notification — deduped to at most one push per user per day). Execution reuses executeToolCall — same result caps, and the
 * floor-action hard stop (send_email needs a verified receipt) stays as the
 * second layer under the whitelist.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CHAT_TOOL_NAMES } from "../agentcore/chat-engine.js";
import { ALL_TOOLS, executeToolCall, isToolAllowedForPlan } from "../agentcore/tool-executor.js";
import { teamModeEnabled } from "../config.js";

/** Tools the chat allows but MCP must not: they need a human-review surface
 * this transport does not have. */
const MCP_EXCLUDED = new Set(["create_event"]);

export function mcpToolDefs(plan: string) {
  return ALL_TOOLS.filter(
    (tool) =>
      CHAT_TOOL_NAMES.has(tool.function.name) &&
      !MCP_EXCLUDED.has(tool.function.name) &&
      (tool.function.name !== "team_availability" || teamModeEnabled()) &&
      isToolAllowedForPlan(tool.function.name, plan),
  );
}

/** One server per request (stateless Streamable HTTP) — cheap: handlers
 * close over userId/plan, no per-user state lives on the instance. */
export function buildMcpServer(userId: string, plan: string): Server {
  const server = new Server({ name: "klorn", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpToolDefs(plan).map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      inputSchema: tool.function.parameters as { type: "object" },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    // Fail closed against anything outside the MCP set — including tools
    // that exist elsewhere in the registry (send_email, delete_email).
    if (!mcpToolDefs(plan).some((tool) => tool.function.name === name)) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
        ],
        isError: true,
      };
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await executeToolCall(userId, name, args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      // executeToolCall already maps most failures to {"error"} strings; a
      // throw here is the floor-action stop or a genuine crash — either way
      // an in-band tool error, never a dead transport.
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : "Tool failed.",
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
