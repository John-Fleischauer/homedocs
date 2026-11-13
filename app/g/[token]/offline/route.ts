/*
 * The offline snapshot of a shared guide, for its service worker to keep.
 * Guard: the link token. Built with unlocked=false, always — nothing gated is
 * ever written to a phone's storage, whoever is asking.
 */

import { offlineHtml } from "@/lib/guide/offline";
import { guideFor, resolveVisit } from "@/lib/guide/viewing";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const visit = await resolveVisit(token);
  if (!visit) return new Response("Gone", { status: 410 });
  const guide = await guideFor(visit, false);
  return new Response(offlineHtml(guide, visit.link.expiresAt), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Guide-Expires": String(visit.link.expiresAt.getTime()),
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
