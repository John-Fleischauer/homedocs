"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  deleteSecret,
  deleteSection,
  saveSecret,
  saveSection,
} from "@/lib/guide/guide";
import { act, type ActionResult } from "@/lib/web/action";
import { checked, id, text, timestamp, withForm } from "@/lib/web/fields";

/* null for a new section or secret, an id for an edit. */
const newOrId = z.union([z.null(), id()]);

export async function saveSectionAction(
  sectionId: string | null,
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: sectionId }),
    z.object({
      id: newOrId,
      title: text(),
      body: text(),
      sensitive: checked(),
      updatedAt: timestamp(),
    }),
    async ({ id, updatedAt, ...input }, { scope, actor }) => {
      await saveSection(db, scope, actor, id, input, updatedAt);
    },
  );
  if (r.error) return r;
  redirect("/guide/edit");
}

export async function deleteSectionAction(
  sectionId: string,
): Promise<ActionResult> {
  const r = await act(
    { id: sectionId },
    z.object({ id: id() }),
    async (input, { scope, actor }) => {
      await deleteSection(db, scope, actor, input.id);
    },
  );
  if (r.error) return r;
  redirect("/guide/edit");
}

export async function saveSecretAction(
  secretId: string | null,
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: secretId }),
    z.object({
      id: newOrId,
      kind: text(200),
      label: text(),
      value: text(10_000),
      ssid: text(),
      security: text(200),
      gate: text(200),
      inGuide: checked(),
      notes: text(),
    }),
    async ({ id, value, ...input }, { scope, actor }) => {
      // Blank on an edit keeps the stored value.
      await saveSecret(db, scope, actor, id, {
        ...input,
        value: value || (id ? undefined : ""),
      });
    },
  );
  if (r.error) return r;
  redirect("/guide/edit");
}

export async function deleteSecretAction(
  secretId: string,
): Promise<ActionResult> {
  const r = await act(
    { id: secretId },
    z.object({ id: id() }),
    async (input, { scope, actor }) => {
      await deleteSecret(db, scope, actor, input.id);
    },
  );
  if (r.error) return r;
  redirect("/guide/edit");
}
