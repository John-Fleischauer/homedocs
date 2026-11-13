"use server";

import { z } from "zod";
import { db } from "../db";
import { parseOwner, type Owner } from "../files/attachments";
import { addLink, removeLink } from "../links/links";
import {
  addFixtureFromHomebox,
  linkPicked,
} from "../integrations/integrations";
import { act, type ActionResult } from "./action";
import { RELOAD, id, oneOf, text, withForm } from "./fields";

/** `kind:id`, the record a link or file belongs to. */
const owner = text(200).transform((value, ctx): Owner => {
  const parsed = parseOwner(value);
  if (!parsed) {
    ctx.addIssue({ code: "custom", message: RELOAD });
    return z.NEVER;
  }
  return parsed;
});

/* An id in the other system: Homebox's are uuids, paperless's are `kind:number`. */
const externalId = text(200).refine((value) => value !== "", { error: RELOAD });

export async function addLinkAction(
  ownerRef: string,
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  return act(
    withForm(fd, { owner: ownerRef }),
    z.object({ owner, url: text(), title: text() }),
    async (input, { scope, actor }) => {
      await addLink(db, scope, actor, input.owner, {
        url: input.url,
        title: input.title,
      });
      return { message: "Linked." };
    },
  );
}

export async function removeLinkAction(linkId: string) {
  return act(
    { id: linkId },
    z.object({ id: id() }),
    async (input, { scope, actor }) => {
      await removeLink(db, scope, actor, input.id);
    },
  );
}

export async function linkPickedAction(
  ownerRef: string,
  system: string,
  external: string,
) {
  return act(
    { owner: ownerRef, system, externalId: external },
    z.object({ owner, system: oneOf(["homebox", "paperless"]), externalId }),
    async (input, { scope, actor }) => {
      await linkPicked(
        db,
        scope,
        actor,
        input.owner,
        input.system,
        input.externalId,
      );
    },
  );
}

export async function addFixtureFromHomeboxAction(
  spaceId: string,
  external: string,
) {
  return act(
    { spaceId, externalId: external },
    z.object({ spaceId: id(), externalId }),
    async (input, { scope, actor }) => {
      await addFixtureFromHomebox(
        db,
        scope,
        actor,
        input.spaceId,
        input.externalId,
      );
    },
  );
}
