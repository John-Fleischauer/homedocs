import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { NoteList } from "@/components/NoteList";
import { EmptyState, List, Row, Section } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { db } from "@/lib/db";
import { comingUp, listNotes } from "@/lib/notes/notes";
import { partsToRebuy } from "@/lib/parts/parts";
import {
  buildTree,
  listSpaces,
  placeCounts,
  type SpaceNode,
} from "@/lib/places/places";
import { preferredByTrade, telHref } from "@/lib/contacts/contacts";
import { tradeLabeler } from "@/lib/contacts/trade-labels";
import { getTradeGroups } from "@/lib/contacts/trades";
import { listSystems } from "@/lib/systems/systems";
import {
  listProjects,
  OPEN_STATUSES,
  STATUS_LABEL,
} from "@/lib/projects/projects";
import { roleAtLeast } from "@/lib/core/types";
import { formatDay } from "@/lib/web/format";
import { viewer } from "@/lib/web/context";

/*
 * Home is organised the way questions come: by place ("the living-room
 * light"), by system ("where's the water shutoff?"), and by the parts a house
 * keeps needing ("what size filter?"). Contacts, reminders, the log and
 * projects follow.
 */

type Tile = { href: string; name: string; detail: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function countLine(c?: { fixtures: number; parts: number }) {
  if (!c || (c.fixtures === 0 && c.parts === 0)) return "Empty";
  const bits = [];
  if (c.fixtures) bits.push(plural(c.fixtures, "fixture"));
  if (c.parts) bits.push(plural(c.parts, "part"));
  return bits.join(" · ");
}

/* Two to a row, name over one line of detail. No icon: at 360px it leaves a
   name like "Water & plumbing" too little room to stay on one line. */
function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <li key={t.href} className="min-w-0">
          <Link
            href={t.href}
            className="flex min-h-18 flex-col justify-center gap-0.5 rounded-card border border-line bg-card px-3 py-3 hover:bg-sunk"
          >
            <span className="wrap-anywhere text-[15px] font-medium leading-tight text-ink">
              {t.name}
            </span>
            <span className="text-xs text-ink-3">{t.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/*
 * Floors and outdoor areas that have places inside become a heading with their
 * rooms as tiles ("Upstairs": Bedroom, Bath). Every other top-level place is a
 * tile of its own, so the living room is one tap from Home either way.
 */
function placeGroups(roots: SpaceNode[]) {
  const loose: SpaceNode[] = [];
  const groups: { root: SpaceNode; tiles: SpaceNode[] }[] = [];
  for (const r of roots) {
    if (r.children.length && (r.kind === "floor" || r.kind === "outdoor"))
      groups.push({ root: r, tiles: r.children });
    else loose.push(r);
  }
  return { loose, groups };
}

export default async function HomePage() {
  const { scope, user } = await viewer();
  const [
    upcoming,
    recent,
    preferred,
    projects,
    spaces,
    counts,
    rebuy,
    systems,
    tradeGroups,
  ] = await Promise.all([
    comingUp(db, scope),
    listNotes(db, scope, { limit: 3 }),
    preferredByTrade(db, scope),
    listProjects(db, scope, { statuses: OPEN_STATUSES }),
    listSpaces(db, scope),
    placeCounts(db, scope),
    partsToRebuy(db, scope),
    listSystems(db, scope),
    getTradeGroups(db, scope),
  ]);
  const tradeLabel = tradeLabeler(tradeGroups);
  const usedSystems = systems.filter((s) => s.fixtures > 0);
  const canEdit = roleAtLeast(user.role, "member");
  const { loose, groups } = placeGroups(buildTree(spaces));
  const tile = (n: SpaceNode): Tile => ({
    href: `/places/${n.id}`,
    name: n.name,
    detail: countLine(counts.get(n.id)),
  });
  const all = (href: string) => <Link href={href}>All</Link>;

  return (
    <>
      <h1 className="sr-only">Home</h1>
      <SearchBox />

      {spaces.length === 0 ? (
        <Section title="Places">
          <EmptyState
            action={
              canEdit ? (
                <LinkButton href="/places/new" variant="primary">
                  Add Place
                </LinkButton>
              ) : null
            }
          >
            No places yet
          </EmptyState>
        </Section>
      ) : (
        <>
          {loose.length ? (
            <Section title="Places" action={all("/places")}>
              <Tiles tiles={loose.map(tile)} />
            </Section>
          ) : null}
          {groups.map(({ root, tiles }) => (
            <Section
              key={root.id}
              title={root.name}
              action={<Link href={`/places/${root.id}`}>Open</Link>}
            >
              <Tiles tiles={tiles.map(tile)} />
            </Section>
          ))}
        </>
      )}

      {usedSystems.length > 0 ? (
        <Section title="Systems" action={all("/systems")}>
          <Tiles
            tiles={usedSystems.map((s) => ({
              href: `/systems/${s.id}`,
              name: s.name,
              detail: plural(s.fixtures, "fixture"),
            }))}
          />
        </Section>
      ) : null}

      {rebuy.length > 0 ? (
        <Section title="Parts in Use" action={all("/parts")}>
          <List>
            {rebuy.slice(0, 8).map((p) => (
              <Row
                key={p.id}
                href={`/parts/${p.id}`}
                icon="part"
                title={p.name}
                detail={
                  p.usedBy.slice(0, 3).join(", ") +
                  (p.usedBy.length > 3
                    ? ` and ${p.usedBy.length - 3} more`
                    : "")
                }
              />
            ))}
          </List>
        </Section>
      ) : null}

      {preferred.length > 0 ? (
        <Section title="Who to Call" action={all("/contacts")}>
          <List>
            {preferred.slice(0, 6).map(({ trade, contact }) => {
              const phone = contact.phones[0]?.value;
              return (
                <Row
                  key={`${trade}-${contact.id}`}
                  href={`/contacts/${contact.id}`}
                  icon="contact"
                  title={contact.name}
                  detail={tradeLabel(trade)}
                  trailing={
                    phone ? (
                      <a
                        href={telHref(phone)}
                        aria-label={`Call ${contact.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent"
                      >
                        <Icon name="phone" />
                      </a>
                    ) : null
                  }
                />
              );
            })}
          </List>
        </Section>
      ) : null}

      {upcoming.length > 0 ? (
        <Section title="Coming Up">
          <List>
            {upcoming.map(({ note, spaceName, fixtureName, supplyName }) => (
              <Row
                key={note.id}
                href={`/notes/${note.id}`}
                icon="note"
                title={note.nextTime || note.title}
                detail={[
                  formatDay(note.remindAfter),
                  supplyName ?? fixtureName ?? spaceName,
                  note.nextTime ? note.title : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </List>
        </Section>
      ) : null}

      <Section
        title="Log"
        action={
          recent.length ? (
            all("/notes")
          ) : canEdit ? (
            <Link href="/notes/new">Add Entry</Link>
          ) : null
        }
      >
        {recent.length ? <NoteList rows={recent} /> : null}
      </Section>

      <Section
        title="Projects"
        action={
          projects.length ? (
            all("/projects")
          ) : canEdit ? (
            <Link href="/projects/new">Add Project</Link>
          ) : null
        }
      >
        {projects.length > 0 ? (
          <List>
            {projects.slice(0, 5).map((p) => (
              <Row
                key={p.id}
                href={`/projects/${p.id}`}
                icon="project"
                title={p.title}
                detail={`${STATUS_LABEL[p.status]}${p.openItems ? ` · ${p.openItems} to-do${p.openItems === 1 ? "" : "s"} left` : ""}`}
              />
            ))}
          </List>
        ) : null}
      </Section>
    </>
  );
}
