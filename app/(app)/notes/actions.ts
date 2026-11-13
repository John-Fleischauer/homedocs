"use server";

import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { supplyUses } from "@/lib/db/schema";
import {
  createNote,
  deleteNote,
  getNote,
  suggestedNeed,
  updateNote,
} from "@/lib/notes/notes";
import { updateUse } from "@/lib/parts/parts";
import { ValidationError } from "@/lib/core/types";
import { act, type ActionResult } from "@/lib/web/action";
import { id, optionalId, text, timestamp, withForm } from "@/lib/web/fields";

const noteFields = {
  title: text(),
  happenedOn: text(200),
  body: text(),
  spaceId: optionalId(),
  fixtureId: optionalId(),
  supplyId: optionalId(),
  contactId: optionalId(),
  projectId: optionalId(),
  quantity: text(200),
  unit: text(200),
  cost: text(200),
  nextTime: text(),
  remindAfter: text(200),
};

const byId = z.object({ id: id() });

export async function createNoteAction(
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const r = await act(
    fd,
    z.object(noteFields),
    async (input, { scope, actor }) => ({
      id: (await createNote(db, scope, actor, input)).id,
    }),
  );
  if (r.error) return r;
  redirect(`/notes/${r.id}`);
}

export async function updateNoteAction(
  noteId: string,
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: noteId }),
    z.object({ ...noteFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...input }, { scope, actor }) => {
      await updateNote(db, scope, actor, id, input, updatedAt);
    },
  );
  if (r.error) return r;
  redirect(`/notes/${noteId}`);
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  const r = await act({ id: noteId }, byId, async (input, { scope, actor }) => {
    await deleteNote(db, scope, actor, input.id);
  });
  if (r.error) return r;
  redirect("/notes");
}

/** "Update needed amount to 15?" — carry a note's lesson onto the part's use. */
export async function applyNeedAction(noteId: string): Promise<ActionResult> {
  return act({ id: noteId }, byId, async (input, { scope, actor }) => {
    const note = await getNote(db, scope, input.id);
    const need = suggestedNeed(note);
    if (need === null || !note.supplyId || !(note.spaceId || note.fixtureId)) {
      throw new ValidationError(
        "There’s no amount to carry over from this note.",
      );
    }
    const uses = await db
      .select({ id: supplyUses.id })
      .from(supplyUses)
      .where(
        and(
          eq(supplyUses.supplyId, note.supplyId),
          note.fixtureId
            ? eq(supplyUses.fixtureId, note.fixtureId)
            : eq(supplyUses.spaceId, note.spaceId!),
          isNull(supplyUses.deletedAt),
        ),
      );
    if (uses.length !== 1)
      throw new ValidationError(
        "Link the part to that place first, then try again.",
      );
    await updateUse(db, scope, actor, uses[0]!.id, {
      quantityNeeded: String(need),
    });
    return { message: `Saved: it really needs ${need}.` };
  });
}
