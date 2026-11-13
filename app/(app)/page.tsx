import Link from 'next/link'
import { SearchBox } from '@/components/SearchBox'
import { SystemTiles } from '@/components/SystemTiles'
import { EmptyState, List, Row, Section } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'
import { db } from '@/lib/db'
import { comingUp } from '@/lib/notes/notes'
import { partsToRebuy } from '@/lib/parts/parts'
import { buildTree, listSpaces, placeCounts, type SpaceNode } from '@/lib/places/places'
import { preferredByTrade, telHref } from '@/lib/contacts/contacts'
import { tradeLabeler } from '@/lib/contacts/trade-labels'
import { getTradeGroups } from '@/lib/contacts/trades'
import { listSystems } from '@/lib/systems/systems'
import { listProjects, OPEN_STATUSES, STATUS_LABEL } from '@/lib/projects/projects'
import { roleAtLeast } from '@/lib/core/types'
import { formatDay } from '@/lib/web/format'
import { viewer } from '@/lib/web/context'

/*
 * Home is organised the way questions come: by place ("the living-room
 * light"), by system ("where's the water shutoff?"), and by the parts a house
 * keeps needing ("what size filter?"). Contacts, reminders and projects follow.
 */

type Tile = { id: string; name: string; counts?: { fixtures: number; parts: number } }

function countLine(c?: { fixtures: number; parts: number }) {
  if (!c || (c.fixtures === 0 && c.parts === 0)) return 'Nothing yet'
  const bits = []
  if (c.fixtures) bits.push(`${c.fixtures} fixture${c.fixtures === 1 ? '' : 's'}`)
  if (c.parts) bits.push(`${c.parts} part${c.parts === 1 ? '' : 's'}`)
  return bits.join(' · ')
}

function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <li key={t.id} className="min-w-0">
          <Link
            href={`/places/${t.id}`}
            className="flex min-h-18 flex-col justify-center gap-0.5 rounded-card border border-line bg-card px-3 py-3 hover:bg-sunk"
          >
            <span className="wrap-anywhere text-[15px] font-medium leading-tight text-ink">{t.name}</span>
            <span className="text-xs text-ink-3">{countLine(t.counts)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/*
 * Floors and outdoor areas that have places inside become a heading with their
 * rooms as tiles ("Upstairs": Bedroom, Bath). Every other top-level place is a
 * tile of its own, so the living room is one tap from Home either way.
 */
function placeGroups(roots: SpaceNode[]) {
  const loose: SpaceNode[] = []
  const groups: { root: SpaceNode; tiles: SpaceNode[] }[] = []
  for (const r of roots) {
    if (r.children.length && (r.kind === 'floor' || r.kind === 'outdoor')) groups.push({ root: r, tiles: r.children })
    else loose.push(r)
  }
  return { loose, groups }
}

export default async function HomePage() {
  const { scope, user } = await viewer()
  const [upcoming, preferred, projects, spaces, counts, rebuy, systems, tradeGroups] = await Promise.all([
    comingUp(db, scope),
    preferredByTrade(db, scope),
    listProjects(db, scope, { statuses: OPEN_STATUSES }),
    listSpaces(db, scope),
    placeCounts(db, scope),
    partsToRebuy(db, scope),
    listSystems(db, scope),
    getTradeGroups(db, scope),
  ])
  const tradeLabel = tradeLabeler(tradeGroups)
  const usedSystems = systems.filter((s) => s.fixtures > 0)
  const canEdit = roleAtLeast(user.role, 'member')
  const { loose, groups } = placeGroups(buildTree(spaces))
  const tile = (n: SpaceNode): Tile => ({ id: n.id, name: n.name, counts: counts.get(n.id) })

  return (
    <>
      <h1 className="sr-only">Home</h1>
      <SearchBox />

      {spaces.length === 0 ? (
        <Section title="Places">
          <EmptyState action={canEdit ? <LinkButton href="/places/new" variant="primary">Add Place</LinkButton> : null}>
            No places yet
          </EmptyState>
        </Section>
      ) : (
        <>
          {loose.length ? (
            <Section title="Places" action={<Link href="/places" className="text-sm text-accent">All</Link>}>
              <Tiles tiles={loose.map(tile)} />
            </Section>
          ) : null}
          {groups.map(({ root, tiles }) => (
            <Section
              key={root.id}
              title={root.name}
              action={
                <Link href={`/places/${root.id}`} className="text-sm text-accent">
                  Open
                </Link>
              }
            >
              <Tiles tiles={tiles.map(tile)} />
            </Section>
          ))}
        </>
      )}

      {usedSystems.length > 0 ? (
        <Section title="Systems" action={<Link href="/systems" className="text-sm text-accent">All</Link>}>
          <SystemTiles systems={usedSystems} />
        </Section>
      ) : null}

      {rebuy.length > 0 ? (
        <Section title="Parts in Use" action={<Link href="/parts" className="text-sm text-accent">All Parts</Link>}>
          <List>
            {rebuy.slice(0, 8).map((p) => (
              <Row
                key={p.id}
                href={`/parts/${p.id}`}
                icon="part"
                title={p.name}
                detail={p.usedBy.slice(0, 3).join(', ') + (p.usedBy.length > 3 ? ` and ${p.usedBy.length - 3} more` : '')}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {preferred.length > 0 ? (
        <Section title="Who to Call" action={<Link href="/contacts" className="text-sm text-accent">All</Link>}>
          <List>
            {preferred.slice(0, 6).map(({ trade, contact }) => {
              const phone = contact.phones[0]?.value
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
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent"
                      >
                        <Icon name="phone" />
                      </a>
                    ) : null
                  }
                />
              )
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
                detail={[formatDay(note.remindAfter), supplyName ?? fixtureName ?? spaceName, `from “${note.title}”`]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </List>
        </Section>
      ) : null}

      <Section title="Projects" action={<Link href="/projects" className="text-sm text-accent">All</Link>}>
        {projects.length > 0 ? (
          <List>
            {projects.slice(0, 5).map((p) => (
              <Row
                key={p.id}
                href={`/projects/${p.id}`}
                icon="project"
                title={p.title}
                detail={`${STATUS_LABEL[p.status]}${p.openItems ? ` · ${p.openItems} to do` : ''}`}
              />
            ))}
          </List>
        ) : (
          <EmptyState action={canEdit ? <LinkButton href="/projects/new">Add Project</LinkButton> : null}>
            No open projects
          </EmptyState>
        )}
      </Section>

    </>
  )
}
