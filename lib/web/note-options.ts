import { db } from "../db";
import type { PropertyScope } from "../core/types";
import type { NoteFormOptions } from "@/app/(app)/notes/note-form";
import { listContacts } from "../contacts/contacts";
import { buildTree, flattenTree, listSpaces } from "../places/places";
import { listParts } from "../parts/parts";
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
  return {
    places,
    fixtures: fixtures.map((t) => ({
      id: t.id,
      label: t.spaceId
        ? `${t.name} (${placeLabel.get(t.spaceId) ?? ""})`
        : t.name,
    })),
    parts: parts.map(({ part }) => ({ id: part.id, label: part.name })),
    contacts: contacts.map((p) => ({
      id: p.id,
      label: p.company ? `${p.name} (${p.company})` : p.name,
    })),
    projects: projects.map((p) => ({ id: p.id, label: p.title })),
  };
}
