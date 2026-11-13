/*
 * The launch URL for the app tile in Pocket ID: `<PUBLIC_BASE_URL>/sso`.
 *
 * Someone already signed in goes straight in; anyone else starts a single
 * sign-on round trip, which Pocket ID completes without asking when they were
 * just there. Public, like /login/oidc, which it hands off to.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { DEFAULT_AFTER_LOGIN, safeNext } from "@/lib/auth/redirects";
import { absoluteUrl } from "@/lib/web/urls";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const user = await getCurrentUser();
  const start =
    next === DEFAULT_AFTER_LOGIN
      ? "/login/oidc"
      : `/login/oidc?${new URLSearchParams({ next })}`;
  // Absolute on the public origin: behind the proxy, the request URL is the container's.
  const response = NextResponse.redirect(absoluteUrl(user ? next : start), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
