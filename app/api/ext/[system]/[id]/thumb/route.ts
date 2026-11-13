/*
 * A linked record's thumbnail, fetched with the stored token and cached.
 * Guard: requireApiUser(), and the id must be one a live link in this home
 * points at (linkedThumb) — so this cannot be used to browse paperless.
 */

import { requireApiUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { linkedThumb } from "@/lib/integrations/integrations";
import { listProperties } from "@/lib/property/property";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ system: string; id: string }> },
) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { system, id } = await params;
  if (system !== "homebox" && system !== "paperless")
    return new Response("Not found", { status: 404 });
  const [property] = await listProperties();
  if (!property) return new Response("Not found", { status: 404 });
  const bytes = await linkedThumb(db, { propertyId: property.id }, system, id);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
