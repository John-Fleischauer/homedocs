/*
 * An MCP client wired to the real server over the SDK's in-memory transport, so
 * tests go through initialize, tools/list and tools/call — the wiring is most of
 * what is worth checking.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Role } from "../../lib/core/types";
import { createMcpServer } from "../../lib/mcp/server";
import type { Scope } from "../../lib/oauth/config";
import type { BearerIdentity } from "../../lib/oauth/grants";
import { db } from "./db";

export function identityFor(
  userId: string,
  role: Role,
  scopes: Scope[] = ["homedocs:read", "homedocs:write"],
): BearerIdentity {
  return {
    userId,
    role,
    clientId: "hd_test_client",
    clientName: "Claude",
    scopes,
    resource: "https://homedocs.example.test/mcp",
  };
}

export async function connect(identity: BearerIdentity) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createMcpServer(identity, db);
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    call: (name: string, args: Record<string, unknown> = {}) =>
      client.callTool({ name, arguments: args }) as Promise<CallToolResult>,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function textOf(result: CallToolResult): string {
  return result.content
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n");
}

export function dataOf<T = Record<string, unknown>>(result: CallToolResult): T {
  return result.structuredContent as T;
}
