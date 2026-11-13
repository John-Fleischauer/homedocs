/*
 * A photo on a shared guide. Guard: the link token, and the file must be on a
 * record this guide shows (an emergency fixture's photo). Anything else is a 404
 * — a hash alone is never a key.
 */

import { fileResponse } from "@/lib/files/serve";
import { guideFor, resolveVisit } from "@/lib/guide/viewing";
import { guideLimiter } from "@/lib/web/limits";
import { clientIp } from "@/lib/web/client-ip";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; sha: string }> },
) {
  const { token, sha } = await params;
  if (!/^[a-f0-9]{64}$/.test(sha))
    return new Response("Not found", { status: 404 });
  if (!guideLimiter.take(clientIp(request.headers) ?? "unknown"))
    return new Response("Slow down", { status: 429 });
  const visit = await resolveVisit(token);
  if (!visit) return new Response("Not found", { status: 404 });
  const guide = await guideFor(visit, false);
  if (!guide.files.has(sha)) return new Response("Not found", { status: 404 });
  return fileResponse(
    sha,
    { mime: "image/jpeg", originalName: "photo.jpg" },
    new URL(request.url).searchParams.has("thumb"),
    "private, max-age=300",
  );
}
