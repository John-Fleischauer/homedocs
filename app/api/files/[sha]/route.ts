/*
 * Serve a stored file to a signed-in family member. Guard: requireApiUser().
 *
 * Only files that belong to a live attachment are served — a hash on its own
 * is not a key. The house guide serves its photos through its own route
 * (app/g/[token]/files/[sha]), which checks the file is on a record the guide
 * shows.
 */

import { requireApiUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { findBySha } from "@/lib/files/attachments";
import { fileResponse } from "@/lib/files/serve";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sha: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { sha } = await params;
  if (!/^[a-f0-9]{64}$/.test(sha))
    return new Response("Not found", { status: 404 });
  const found = await findBySha(db, sha);
  if (!found) return new Response("Not found", { status: 404 });
  return fileResponse(
    sha,
    found,
    new URL(request.url).searchParams.has("thumb"),
  );
}
