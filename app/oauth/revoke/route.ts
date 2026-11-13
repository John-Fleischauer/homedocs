/*
 * RFC 7009 — token revocation.
 *
 * This is the client's way to disconnect. The Settings screen is the other one,
 * and they meet at revokeGrant: pressing "revoke" in homedocs and removing the
 * connector in claude.ai should leave the same state behind.
 *
 * The response is 200 whether or not the token existed, and that is the
 * specification rather than sloppiness (§2.2): a revocation endpoint that
 * distinguishes "revoked" from "no such token" is an oracle for testing whether
 * a guessed token is real, and the caller has nothing useful to do with the
 * difference in either case.
 */

import { OAuthError } from "@/lib/oauth/errors";
import { revokeToken } from "@/lib/oauth/grants";
import {
  corsHeaders,
  firstIssue,
  oauthError,
  formFields,
  oauthJson,
  oauthParam,
  preflight,
  readOAuthBody,
  serverError,
} from "@/lib/oauth/http";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/* `token_type_hint` is read only so that sending it twice is refused like any
   other parameter; its value is ignored (below). Anything else (claude.ai sends
   `client_id`) is ignored. */
const revokeRequest = z.object({
  token: oauthParam("token"),
  token_type_hint: oauthParam("token_type_hint"),
});

const refuse = oauthError;

export async function POST(request: Request) {
  const body = await readOAuthBody(request, "invalid_request");
  if ("error" in body) return refuse(body.error);

  const parsed = revokeRequest.safeParse(formFields(body.text));
  if (!parsed.success)
    return refuse(new OAuthError("invalid_request", firstIssue(parsed.error)));

  const token = parsed.data.token;
  if (!token)
    return refuse(new OAuthError("invalid_request", "token is required"));

  /* token_type_hint is advisory and deliberately ignored: the hash lookup finds
     the row whatever kind it is, and a wrong hint must not cause a real token to
     survive revocation (§2.1). */
  try {
    await revokeToken(db, token);
  } catch (err) {
    return serverError("revoke", err);
  }

  return new Response(null, { status: 200, headers: corsHeaders() });
}

export async function OPTIONS() {
  return preflight();
}

export async function GET() {
  return oauthJson(
    {
      error: "invalid_request",
      error_description: "the revocation endpoint is a POST",
    },
    { status: 405, headers: { ...corsHeaders(), allow: "POST, OPTIONS" } },
  );
}
