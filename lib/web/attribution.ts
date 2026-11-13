import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { timeAgo } from "./format";

/** "Edited by Mom, 2 days ago" — from a record's updated_by and updated_at. */
export async function editedBy(row: {
  updatedBy: string | null;
  updatedAt: Date;
}): Promise<string> {
  if (!row.updatedBy) return `Edited ${timeAgo(row.updatedAt)}`;
  const [u] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, row.updatedBy));
  return `Edited by ${u?.name ?? "someone"}, ${timeAgo(row.updatedAt)}`;
}
