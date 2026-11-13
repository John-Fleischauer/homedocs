"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { createShareLink, revokeShareLink } from "@/lib/guide/share-links";
import { act, type ActionResult } from "@/lib/web/action";
import { id, int, optionalId, text } from "@/lib/web/fields";

export async function createShareAction(
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  return act(
    fd,
    z.object({
      label: text(),
      /* The domain says which lengths it allows; this only keeps it a whole number. */
      days: int(0, 100_000, "Pick how long the link lasts.", 7),
      pin: text(200),
      rootSpaceId: optionalId(),
    }),
    async (input, { scope, actor }) => {
      const { url } = await createShareLink(db, scope, actor, input);
      return { message: url };
    },
  );
}

export async function revokeShareAction(linkId: string): Promise<ActionResult> {
  return act(
    { id: linkId },
    z.object({ id: id() }),
    async (input, { scope, actor }) => {
      await revokeShareLink(db, scope, actor, input.id);
    },
  );
}
