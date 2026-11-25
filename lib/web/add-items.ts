/*
 * What "+" can add, shared by the header menu and the /add page (the app
 * shortcut). Opened on a place, fixture or system, the choices fill in where.
 */

import type { IconName } from "@/components/ui/icons";

export type AddItem = {
  href: string;
  icon: IconName;
  title: string;
  detail: string;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function addItems(pathname = "/"): AddItem[] {
  const at = (kind: string) =>
    new RegExp(`^/${kind}/(${UUID})(?:/|$)`, "i").exec(pathname)?.[1];
  const space = at("places");
  const fixture = at("fixtures");
  const project = at("projects");
  const contact = at("contacts");
  const system = at("systems");
  const noteFor = space
    ? `?space=${space}`
    : fixture
      ? `?fixture=${fixture}`
      : project
        ? `?project=${project}`
        : contact
          ? `?contact=${contact}`
          : "";

  return [
    {
      href: `/notes/new${noteFor}`,
      icon: "note",
      title: "Log Entry",
      detail: "A repair, service visit or filter change",
    },
    {
      href: `/fixtures/new${space ? `?space=${space}` : system ? `?system=${system}` : ""}`,
      icon: "fixture",
      title: "Fixture",
      detail: "A light, shutoff or appliance",
    },
    space || fixture
      ? {
          href: `/use?${space ? `space=${space}` : `fixture=${fixture}`}`,
          icon: "part",
          title: "Part",
          detail: "A bulb, paint or filter used here",
        }
      : {
          href: "/parts/new",
          icon: "part",
          title: "Part",
          detail: "A bulb, paint or filter",
        },
    {
      href: `/places/new${space ? `?parent=${space}` : ""}`,
      icon: "place",
      title: "Place",
      detail: space ? "Inside this place" : "A room, floor or yard",
    },
    {
      href: "/contacts/new",
      icon: "contact",
      title: "Contact",
      detail: "A plumber or utility",
    },
    {
      href: "/projects/new",
      icon: "project",
      title: "Project",
      detail: "A job to get done",
    },
  ];
}
