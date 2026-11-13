/*
 * RFC 9728 — protected resource metadata.
 *
 * Step 2 of the handshake in docs/MCP.md: the 401 from /mcp names this
 * document, and this document names the authorization server. It is the whole of
 * what a client needs to get from "I was refused" to "I know where to log in".
 *
 * The optional catch-all is not decoration. The specification builds the metadata
 * URL by inserting the well-known path *before* the resource's own path, so a
 * resource at /mcp is described at
 * /.well-known/oauth-protected-resource/mcp — while older clients ask for the
 * bare path. Both are the same document here, and answering only one of them is
 * a discovery failure that reports itself as a 404 with nothing to act on.
 */

import { MCP_PATH, SCOPES, absoluteUrl, baseUrl } from "@/lib/oauth/config";
import { oauthJson, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return oauthJson({
    resource: absoluteUrl(MCP_PATH),
    authorization_servers: [baseUrl()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: absoluteUrl("/settings/connectors"),
  });
}

export async function OPTIONS() {
  return preflight();
}
