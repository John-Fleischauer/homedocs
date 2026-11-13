/*
 * The MCP server, built per request from the token that authenticated it.
 *
 * Per request rather than per process because there is no MCP session state
 *: every call carries its own credentials, so the tool surface a
 * connection sees is a function of the token in front of it and nothing else. A
 * long-lived server would have to be told which caller it was serving on every
 * message, which is the same work with a shared mutable object in the middle.
 *
 * The low-level Server rather than McpServer, deliberately. McpServer's
 * registerTool is the ergonomic path, but it answers a call to a tool it does
 * not hold with "Tool X not found" and a call to a disabled one with "Tool X
 * disabled" — protocol errors, in a place where MCP.md wants a refusal that
 * names the scope and says reconnecting can grant it. Owning tools/list and
 * tools/call means the list can be filtered *and* the call can answer properly,
 * which is the whole of the two-layer design in that document.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AppError } from "../core/types";
import type { BearerIdentity } from "../oauth/grants";
import { actorFor } from "./auth";
import { granted, refusalFor } from "./scopes";
import { readTools } from "./tools/read";
import { writeTools } from "./tools/write";
import {
  ToolRefusal,
  type ToolContext,
  type ToolDefinition,
} from "./tools/types";
import type { Executor } from "../core/types";

export const SERVER_NAME = "homedocs";
export const SERVER_VERSION = "0.1.0";

/** Every tool that exists, at every scope. Filtered per connection, never per file. */
export const allTools: ToolDefinition[] = [...readTools, ...writeTools];

export function toolsFor(identity: BearerIdentity): ToolDefinition[] {
  return allTools.filter((tool) => granted(identity, tool.scope));
}

export function createMcpServer(
  identity: BearerIdentity,
  exec: Executor,
): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "homedocs is a family's reference for their house. Places are rooms and outdoor areas " +
        "(a tree). Fixtures are things installed in a place (a light, a shutoff valve). Systems " +
        "(water & plumbing, electrical, heating…) group fixtures by what they do, with who to call; " +
        'for "where is the water shutoff" use get_system. Parts are ' +
        "reusable specs — a bulb type, a paint colour, a filter — linked to the fixtures and places " +
        'that use them. Notes are dated records of what happened, with a "next time" lesson. ' +
        "Contacts are the companies and people the house relies on — contractors, utilities, services — " +
        "with trades and a preferred contact per trade. " +
        "Projects are jobs with a status, a checklist, materials and quotes. A series is a job done again " +
        "and again (pine straw every spring): it holds how we do it and the default checklist and materials " +
        'each new round starts with; use get_series for "how much do we usually need". ' +
        'To answer "what bulb does X take", ' +
        "use find_part_for. Codes and passwords are never available here.",
    },
  );

  const context: ToolContext = { exec, actor: actorFor(identity), identity };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    /* Filtered by scope — ergonomics, so a model does not plan around a tool it
       cannot call. Not enforcement: see the check in the call handler, which is
       the one that holds when a list has gone stale. */
    tools: toolsFor(identity).map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: jsonSchemaFor(tool),
      annotations: { title: tool.title, ...tool.annotations },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = allTools.find(
      (candidate) => candidate.name === request.params.name,
    );

    if (!tool) {
      return errorResult(
        `There is no tool called ${request.params.name}.`,
        "Call tools/list to see what this connection can do.",
      );
    }

    /*
     * The load-bearing check. A tool list is client-side and can be stale — a
     * conversation that began before a re-grant narrowed its scopes is holding
     * one that no longer describes what it may do — so the answer to "may I"
     * is computed here, from the live token and the live role, on every call.
     */
    if (!granted(identity, tool.scope)) {
      return errorResult(refusalFor(identity, tool.scope));
    }

    const parsed = tool.input.safeParse(request.params.arguments ?? {});
    if (!parsed.success) {
      /* Returned as content rather than thrown as an InvalidParams protocol
         error: a model corrects "location_id must be a uuid" and cannot do
         anything with a transport-level failure. */
      return errorResult(
        `Those arguments are not valid for ${tool.name}.`,
        z.prettifyError(parsed.error),
      );
    }

    try {
      const result = await tool.handler(parsed.data, context);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (err) {
      if (err instanceof ToolRefusal) return errorResult(err.message, err.hint);

      /* An AppError is homedocs refusing for a reason it can state — a
         stale write, a place cycle, a missing record. Those messages
         were written to be read by a contact and are the right thing to hand
         back. Anything else is a bug, and a stack trace is not a thing a model
         can recover from. */
      if (err instanceof AppError) return errorResult(err.message);

      console.error("[mcp] tool failed", { tool: tool.name, err });
      return errorResult(
        `${tool.name} failed unexpectedly. homedocs is unchanged.`,
        "Try again, or report this if it keeps happening.",
      );
    }
  });

  return server;
}

function errorResult(message: string, hint?: string): CallToolResult {
  return {
    content: [
      { type: "text" as const, text: hint ? `${message}\n\n${hint}` : message },
    ],
    isError: true,
  };
}

/*
 * zod schemas are the source of truth for both validation and the advertised
 * shape, so the JSON Schema is generated from the same object that parses the
 * arguments. Two hand-maintained copies would drift, and the direction they
 * drift in is a tool that documents a parameter it rejects.
 */
const schemaCache = new WeakMap<ToolDefinition, Record<string, unknown>>();

function jsonSchemaFor(tool: ToolDefinition): Record<string, unknown> {
  const cached = schemaCache.get(tool);
  if (cached) return cached;

  const schema = z.toJSONSchema(tool.input, { io: "input" }) as Record<
    string,
    unknown
  >;
  // The $schema key is noise in a tool listing; the draft is fixed by the spec.
  delete schema.$schema;
  schemaCache.set(tool, schema);
  return schema;
}
