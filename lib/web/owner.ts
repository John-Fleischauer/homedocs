import { db } from "../db";
import type { PropertyScope } from "../core/types";
import { getSpace } from "../places/places";
import { getFixture } from "../fixtures/fixtures";

/** The fixture or place a page was opened from (?fixture= or ?space=), for "add here" flows. */
export async function ownerFromParams(
  scope: PropertyScope,
  params: { fixture?: string; space?: string },
): Promise<
  | { kind: "fixture" | "place"; id: string; name: string; href: string }
  | undefined
> {
  if (params.fixture) {
    const t = await getFixture(db, scope, params.fixture);
    return {
      kind: "fixture",
      id: t.id,
      name: t.name,
      href: `/fixtures/${t.id}`,
    };
  }
  if (params.space) {
    const s = await getSpace(db, scope, params.space);
    return { kind: "place", id: s.id, name: s.name, href: `/places/${s.id}` };
  }
  return undefined;
}
