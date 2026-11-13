/*
 * RFC 7591 — Dynamic Client Registration.
 *
 * The only unauthenticated write endpoint in the application, which is why the
 * hardening in lib/oauth/clients.ts exists and why the limiter sits in front of
 * it. It stays unauthenticated because it is what makes connecting a matter of
 * pasting one URL: without it, adding the connector means generating a client ID
 * here and pasting it there, which is the only genuinely annoying step in the
 * whole flow.
 *
 * Under app/api/? No — under app/oauth/, and either way nothing about placement
 * authenticates it. That is the point: registration grants nothing. A registered
 * client can do exactly nothing until a logged-in human approves it at
 * /oauth/authorize.
 */

import { z } from "zod";
import {
  MAX_REDIRECT_URIS,
  registerClient,
  registrationResponse,
} from "@/lib/oauth/clients";
import { OAuthError } from "@/lib/oauth/errors";
import {
  corsHeaders,
  oauthError,
  oauthJson,
  preflight,
  readOAuthBody,
  serverError,
} from "@/lib/oauth/http";
import { clientAddress, fixedWindow } from "@/lib/oauth/rate-limit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/*
 * Ten an hour per address. A person connecting a connector does this once and
 * retries at most a handful of times; ten is generous for that and useless as a
 * way to fill a table. Module scope, so the window survives between requests and
 * resets with the container — see lib/oauth/rate-limit.ts on why that is
 * acceptable here.
 */
const limiter = fixedWindow(10, 60 * 60 * 1000);

/*
 * The metadata this server reads (RFC 7591 §2); anything else a client sends
 * (grant_types, response_types, token_endpoint_auth_method, scope …) is
 * ignored, as before. The shape is checked here; what is acceptable (which
 * redirect targets, how long a name) stays in registerClient. Optional fields
 * may be null, which some clients send.
 */
const URIS_REQUIRED = "redirect_uris is required and must be an array";
const registration = z.object(
  {
    client_name: z
      .string({ error: "client_name must be text" })
      .max(10_000, { error: "client_name is too long" })
      .nullish(),
    redirect_uris: z
      .array(
        z
          .string({ error: "each redirect_uri must be text" })
          .max(2_048, { error: "a redirect_uri is too long" }),
        {
          error: URIS_REQUIRED,
        },
      )
      .min(1, { error: URIS_REQUIRED })
      .max(MAX_REDIRECT_URIS, {
        error: `at most ${MAX_REDIRECT_URIS} redirect_uris may be registered`,
      }),
    logo_uri: z
      .string({ error: "logo_uri must be text" })
      .max(2_048, { error: "logo_uri is too long" })
      .nullish(),
  },
  { error: "the request body must be a JSON object" },
);

export async function POST(request: Request) {
  if (!limiter.take(clientAddress(request))) {
    return oauthJson(
      {
        error: "invalid_client_metadata",
        error_description: "too many registration attempts — try again later",
      },
      { status: 429, headers: { "retry-after": "3600" } },
    );
  }

  /* Capped before it is read: this is the one write anybody can reach. */
  const body = await readOAuthBody(request, "invalid_client_metadata");
  if ("error" in body) return refused(body.error, undefined);

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return oauthJson(
      {
        error: "invalid_client_metadata",
        error_description: "the request body must be JSON",
      },
      { status: 400 },
    );
  }

  const parsed = registration.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code =
      issue?.path[0] === "redirect_uris"
        ? "invalid_redirect_uri"
        : "invalid_client_metadata";
    return refused(
      new OAuthError(
        code,
        issue?.message ?? "the registration could not be read",
      ),
      payload,
    );
  }

  try {
    const client = await registerClient(db, {
      clientName: parsed.data.client_name ?? undefined,
      redirectUris: parsed.data.redirect_uris,
      logoUri: parsed.data.logo_uri ?? undefined,
    });
    return oauthJson(registrationResponse(client), { status: 201 });
  } catch (err) {
    if (err instanceof OAuthError) return refused(err, payload);
    return serverError("registration", err);
  }
}

/*
 * Logged because the refusal is invisible from the other end. A client that
 * cannot register shows its user "couldn't connect" and swallows the body, so
 * without this line the only way to find out *what* was refused is to guess at
 * payloads — which is exactly how the first connection attempt against this
 * deployment was debugged.
 *
 * The redirect_uris are the whole point of logging it: they are what gets
 * refused, they are not a secret, and they are the one field a person can
 * compare against the allowlist. Capped, so a refusal can't fill the log.
 */
function refused(err: OAuthError, payload: unknown): Response {
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.slice(0, 10)
    : undefined;
  console.warn("[oauth] registration refused", {
    error: err.code,
    description: err.description,
    clientName:
      typeof body.client_name === "string"
        ? body.client_name.slice(0, 200)
        : null,
    redirectUris: uris?.map((uri) =>
      typeof uri === "string" ? uri.slice(0, 300) : typeof uri,
    ),
  });
  return oauthError(err);
}

export async function OPTIONS() {
  return preflight();
}

/* A GET here is someone exploring, not a client. Say what the endpoint is for
   rather than returning a bare 405 with no content. */
export async function GET() {
  return oauthJson(
    {
      error: "invalid_request",
      error_description: "client registration is a POST — see RFC 7591",
    },
    { status: 405, headers: { ...corsHeaders(), allow: "POST, OPTIONS" } },
  );
}
