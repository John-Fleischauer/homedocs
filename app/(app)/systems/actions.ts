"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  createSystem,
  deleteSystem,
  updateSystem,
} from "@/lib/systems/systems";
import { act, type ActionResult } from "@/lib/web/action";
import { id, many, text, timestamp, withForm } from "@/lib/web/fields";

const systemFields = {
  name: text(),
  icon: text(200),
  trades: many(),
  customTrades: text(),
  notes: text(),
};

/* The form calls the free-text trades `customTrades`; the domain calls them `newTrades`. */
function input({
  customTrades,
  ...rest
}: z.output<z.ZodObject<typeof systemFields>>) {
  return { ...rest, newTrades: customTrades.split(",") };
}

export async function createSystemAction(
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const r = await act(
    fd,
    z.object(systemFields),
    async (fields, { scope, actor }) => ({
      id: (await createSystem(db, scope, actor, input(fields))).id,
    }),
  );
  if (r.error) return r;
  redirect(`/systems/${r.id}`);
}

export async function updateSystemAction(
  systemId: string,
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: systemId }),
    z.object({ ...systemFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...fields }, { scope, actor }) => {
      await updateSystem(db, scope, actor, id, input(fields), updatedAt);
    },
  );
  if (r.error) return r;
  redirect(`/systems/${systemId}`);
}

export async function deleteSystemAction(
  systemId: string,
): Promise<ActionResult> {
  const r = await act(
    { id: systemId },
    z.object({ id: id() }),
    async (input, { scope, actor }) => {
      await deleteSystem(db, scope, actor, input.id);
    },
  );
  if (r.error) return r;
  redirect("/systems");
}
