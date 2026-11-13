/*
 * Links to Homebox, paperless-ngx and Home Assistant, by pasted URL.
 *
 * Step one of the integrations: no API call and no token. The person pastes the
 * address of the item, document or device from the other app; the URL's shape
 * says which app and which record it is, and the link is stored as an
 * external_ref so a later live integration can look it up and fill in the
 * title and thumbnail without anyone re-linking.
 *
 * Recognised shapes:
 *   Homebox          /item/<uuid>, /location/<uuid>          (v0.26+ UI routes)
 *   paperless-ngx    /documents/<id>[/details|/preview]
 *   Home Assistant   /config/devices/device/<id>, /config/areas/area/<id>,
 *                    /config/entities?…entity_id or /history?entity_id=<id>
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { recordAudit } from "../core/audit";
import { inTransaction, liveIn } from "../core/internal";
import { cleanText, cleanUrl, softDelete } from "../core/records";
import {
  assertCanEdit,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { externalRefs } from "../db/schema";
import { OWNER_TABLES, type Owner } from "../files/attachments";

export type ExternalSystem = "homebox" | "paperless" | "homeassistant";

export const SYSTEM_LABEL: Record<ExternalSystem, string> = {
  homebox: "Homebox",
  paperless: "paperless",
  homeassistant: "Home Assistant",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export type ParsedLink = {
  system: ExternalSystem;
  externalId: string;
  kind: string;
};

export function parseExternalUrl(raw: string): ParsedLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "");
  let m: RegExpExecArray | null;

  if ((m = new RegExp(`/(item|location|tag)/(${UUID})$`, "i").exec(path))) {
    return { system: "homebox", externalId: m[2]!.toLowerCase(), kind: m[1]! };
  }
  if (
    (m = /\/documents\/(\d+)(?:\/(?:details|preview|notes|history))?$/.exec(
      path,
    ))
  ) {
    return { system: "paperless", externalId: m[1]!, kind: "document" };
  }
  if ((m = /\/config\/devices\/device\/([0-9a-z]+)$/i.exec(path))) {
    return {
      system: "homeassistant",
      externalId: `device:${m[1]}`,
      kind: "device",
    };
  }
  if ((m = /\/config\/areas\/area\/([0-9a-z_]+)$/i.exec(path))) {
    return {
      system: "homeassistant",
      externalId: `area:${m[1]}`,
      kind: "area",
    };
  }
  const entity = url.searchParams.get("entity_id");
  if (entity && /^[a-z_]+\.[a-z0-9_]+$/.test(entity)) {
    return {
      system: "homeassistant",
      externalId: `entity:${entity}`,
      kind: "entity",
    };
  }
  return null;
}

function defaultTitle(link: ParsedLink): string {
  if (link.system === "paperless") return `Document #${link.externalId}`;
  if (link.system === "homebox")
    return link.kind === "location" ? "Homebox location" : "Homebox item";
  return `Home Assistant ${link.kind}`;
}

export async function addLink(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  owner: Owner,
  input: { url: string; title?: string },
) {
  assertCanEdit(actor);
  const url = cleanUrl(input.url);
  if (!url)
    throw new ValidationError("Paste the address of the item or document.");
  const parsed = parseExternalUrl(url);
  if (!parsed) {
    throw new ValidationError(
      "That doesn’t look like a Homebox item, a paperless document or a Home Assistant device. Copy the address from the item’s own page.",
    );
  }
  const { table, column } = OWNER_TABLES[owner.kind];
  return inTransaction(exec, async (tx) => {
    const found = await tx
      .select({ id: table.id })
      .from(table as never)
      .where(liveIn(table, scope.propertyId, owner.id));
    if (found.length === 0)
      throw new ValidationError("That record no longer exists.");
    const [row] = await tx
      .insert(externalRefs)
      .values({
        propertyId: scope.propertyId,
        system: parsed.system,
        externalId: parsed.externalId,
        url,
        title: cleanText(input.title, 200) || defaultTitle(parsed),
        [column]: owner.id,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "link",
      entityType: "external_ref",
      entityId: row!.id,
      after: {
        system: parsed.system,
        externalId: parsed.externalId,
        owner: `${owner.kind}:${owner.id}`,
      },
    });
    return row!;
  });
}

export async function listLinks(
  exec: Executor,
  scope: PropertyScope,
  owner: Owner,
) {
  const { column } = OWNER_TABLES[owner.kind];
  return exec
    .select()
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.propertyId, scope.propertyId),
        eq(externalRefs[column], owner.id),
        isNull(externalRefs.deletedAt),
      ),
    )
    .orderBy(asc(externalRefs.system), asc(externalRefs.createdAt));
}

export async function removeLink(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, externalRefs, "external_ref", scope, id, actor),
  );
}
