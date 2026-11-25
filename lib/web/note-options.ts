import { db } from "../db";
import type { PropertyScope } from "../core/types";
import type { NoteFormOptions } from "@/app/(app)/notes/note-form";
import { listContacts } from "../contacts/contacts";
import { buildTree, flattenTree, listSpaces } from "../places/places";
import { listParts, partUnits } from "../parts/parts";
import { TEMPLATES } from "../parts/templates";
import { listProjects } from "../projects/projects";
import { listFixtures } from "../fixtures/fixtures";

export async function noteOptions(
  scope: PropertyScope,
): Promise<NoteFormOptions> {
  const [spaces, fixtures, parts, contacts, projects] = await Promise.all([
    listSpaces(db, scope),
    listFixtures(db, scope),
    listParts(db, scope),
    listContacts(db, scope),
    listProjects(db, scope),
  ]);
  const places = flattenTree(buildTree(spaces));
  const placeLabel = new Map(places.map((p) => [p.id, p.label]));
  const parentOf = new Map(spaces.map((s) => [s.id, s.parentId]));
  /* A place and every place it is inside, so a fixture in the living room is also offered for the main floor. */
  const within = (spaceId: string | null) => {
    const out: string[] = [];
    for (
      let at = spaceId;
      at && !out.includes(at);
      at = parentOf.get(at) ?? null
    )
      out.push(at);
    return out;
  };
  return {
    places,
    fixtures: fixtures.map((t) => ({
      id: t.id,
      label: t.spaceId
        ? `${t.name} (${placeLabel.get(t.spaceId) ?? ""})`
        : t.name,
      spaceId: t.spaceId,
      within: within(t.spaceId),
    })),
    parts: parts.map(({ part }) => ({
      id: part.id,
      label: part.name,
      kind: TEMPLATES[part.category].label,
      units: partUnits(part),
    })),
    contacts: contacts.map((p) => ({
      id: p.id,
      label: p.company ? `${p.name} (${p.company})` : p.name,
    })),
    projects: projects.map((p) => ({ id: p.id, label: p.title })),
  };
}
