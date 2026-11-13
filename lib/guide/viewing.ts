/*
 * Resolving a share-link visit: is the link good, is the visitor at home or
 * unlocked, and what may they see. Shared by the page and its file route.
 */

import { cookies, headers } from "next/headers";
import { db } from "../db";
import { getProperty } from "../property/property";
import { clientIp } from "../web/client-ip";
import { buildGuide } from "./guide";
import { isAtHome } from "./location";
import {
  findShareLink,
  unlockCookieName,
  unlockValid,
  type ShareLink,
} from "./share-links";

export type Visit = {
  link: ShareLink;
  ip: string | null;
  userAgent: string | null;
  atHome: boolean;
  unlocked: boolean;
};

export async function resolveVisit(token: string): Promise<Visit | null> {
  const state = await findShareLink(db, token);
  if (!state.ok) return null;
  const h = await headers();
  const ip = clientIp(h);
  const property = await getProperty(state.link.propertyId);
  const atHome = await isAtHome(ip, property);
  const cookie = (await cookies()).get(unlockCookieName(state.link.id))?.value;
  const unlocked = atHome || unlockValid(state.link.id, cookie);
  return {
    link: state.link,
    ip,
    userAgent: h.get("user-agent"),
    atHome,
    unlocked,
  };
}

export function guideFor(visit: Visit, unlocked = visit.unlocked) {
  return buildGuide(
    db,
    { propertyId: visit.link.propertyId },
    { unlocked, rootSpaceId: visit.link.rootSpaceId },
  );
}
