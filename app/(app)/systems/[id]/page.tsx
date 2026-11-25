import Link from "next/link";
import { NoteList } from "@/components/NoteList";
import { DocumentsSection } from "@/components/DocumentsSection";
import { Card, List, Row, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { telHref } from "@/lib/contacts/contacts";
import { tradeLabeler } from "@/lib/contacts/trade-labels";
import { getTradeGroups } from "@/lib/contacts/trades";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { fixtureIcon } from "@/lib/fixtures/kind-labels";
import { listNotes } from "@/lib/notes/notes";
import { systemOverview, type SystemFixture } from "@/lib/systems/systems";
import { viewer } from "@/lib/web/context";

/*
 * One system, the way you'd hand it over: what to reach for first (the guide
 * fixtures, with their photos and instructions), who to call, then everything
 * else in it by place, the parts it takes, and what happened before.
 */
export default async function SystemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const [{ system, fixtures, parts, contacts }, notes, groups] =
    await Promise.all([
      systemOverview(db, scope, id),
      listNotes(db, scope, { systemId: id, limit: 10 }),
      getTradeGroups(db, scope),
    ]);
  const label = tradeLabeler(groups);
  const canEdit = roleAtLeast(user.role, "member");
  const first = fixtures.filter((f) => f.inGuide);
  const rest = fixtures.filter((f) => !f.inGuide);
  const byPlace = new Map<string, SystemFixture[]>();
  for (const f of rest)
    byPlace.set(f.where, [...(byPlace.get(f.where) ?? []), f]);
  const addFixture = canEdit ? (
    <Link href={`/fixtures/new?system=${id}`} className="text-sm text-accent">
      Add Fixture
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={system.name}
        subtitle={
          fixtures.length
            ? `${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"}`
            : undefined
        }
        back={{ href: "/systems", label: "Systems" }}
        actions={
          canEdit ? (
            <Link
              href={`/systems/${id}/edit`}
              aria-label="Edit"
              title="Edit"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunk"
            >
              <Icon name="edit" className="h-5 w-5" />
            </Link>
          ) : null
        }
      />

      {system.notes ? (
        <Card className="mb-2 px-4 py-3">
          <p className="whitespace-pre-wrap text-[15px] text-ink-2">
            {system.notes}
          </p>
        </Card>
      ) : null}

      {first.length ? (
        <Section
          title="On House Guide"
          action={rest.length ? null : addFixture}
        >
          <div className="flex flex-col gap-3">
            {first.map((f) => (
              <Card key={f.id} className="overflow-hidden">
                <Link
                  href={`/fixtures/${f.id}`}
                  className="block hover:bg-sunk"
                >
                  {f.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by our own guarded route
                    <img
                      src={`/api/files/${f.photo}?thumb=1`}
                      alt={f.name}
                      className="max-h-56 w-full object-cover"
                    />
                  ) : null}
                  <span className="block px-4 py-3">
                    <span className="block wrap-anywhere text-[17px] font-semibold text-ink">
                      {f.name}
                    </span>
                    <span className="block wrap-anywhere text-sm text-ink-3">
                      {[f.where, f.category].filter(Boolean).join(" · ")}
                    </span>
                    {f.guideNote ? (
                      <span className="mt-2 block whitespace-pre-wrap text-[15px] text-ink-2">
                        {f.guideNote}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {contacts.length ? (
        <Section title="Who to Call">
          <List>
            {contacts.map((c) => (
              <Row
                key={c.id}
                href={`/contacts/${c.id}`}
                icon="contact"
                title={c.name}
                detail={[c.company, label(c.trade)].filter(Boolean).join(" · ")}
                trailing={
                  c.phone ? (
                    <a
                      href={telHref(c.phone)}
                      aria-label={`Call ${c.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent"
                    >
                      <Icon name="phone" />
                    </a>
                  ) : null
                }
              />
            ))}
          </List>
        </Section>
      ) : system.trades.length && canEdit ? (
        <Section
          title="Who to Call"
          action={
            <Link href="/contacts/new" className="text-sm text-accent">
              Add Contact
            </Link>
          }
        >
          <p className="px-1 text-sm text-ink-3">
            No contact for {system.trades.map(label).join(" or ")}
          </p>
        </Section>
      ) : null}

      {rest.length || !first.length ? (
        <Section
          title={first.length ? "Other Fixtures" : "Fixtures"}
          action={addFixture}
        >
          {fixtures.length === 0 ? null : (
            <div className="flex flex-col gap-3">
              {[...byPlace].map(([where, items]) => (
                <div key={where}>
                  <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-ink-3">
                    {where}
                  </p>
                  <List>
                    {items.map((f) => (
                      <Row
                        key={f.id}
                        href={`/fixtures/${f.id}`}
                        icon={fixtureIcon(f)}
                        title={f.name}
                        detail={f.category || undefined}
                      />
                    ))}
                  </List>
                </div>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {parts.length ? (
        <Section title="Parts">
          <List>
            {parts.map((p) => (
              <Row
                key={p.id}
                href={`/parts/${p.id}`}
                icon="part"
                title={p.name}
                detail={p.usedBy.join(", ")}
              />
            ))}
          </List>
        </Section>
      ) : null}

      {notes.length ? (
        <Section title="Log">
          <NoteList rows={notes} />
        </Section>
      ) : null}

      <DocumentsSection
        owner={{ kind: "system", id }}
        kind="tag"
        canEdit={canEdit}
      />
    </>
  );
}
