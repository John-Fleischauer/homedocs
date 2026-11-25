import Link from "next/link";
import { HomeboxHere } from "@/components/HomeboxHere";
import { DocumentsSection } from "@/components/DocumentsSection";
import { Lessons } from "@/components/Lessons";
import { LinksSection } from "@/components/LinksSection";
import { NoteList } from "@/components/NoteList";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Photos } from "@/components/Photos";
import { UseList } from "@/components/UseList";
import { List, Row, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listAttachments } from "@/lib/files/attachments";
import { lessons, listNotes } from "@/lib/notes/notes";
import { listUses } from "@/lib/parts/parts";
import { getSpace } from "@/lib/places/places";
import { listFixtures } from "@/lib/fixtures/fixtures";
import { fixtureIcon } from "@/lib/fixtures/kind-labels";
import { editedBy } from "@/lib/web/attribution";
import { viewer } from "@/lib/web/context";
import { removeAttachmentAction } from "@/lib/web/shared-actions";

export default async function PlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const place = await getSpace(db, scope, id);
  const [fixtures, uses, notes, photos, tips, edited] = await Promise.all([
    listFixtures(db, scope, { spaceId: id }),
    listUses(db, scope, { spaceId: id }),
    listNotes(db, scope, { spaceId: id, limit: 20 }),
    listAttachments(db, scope, { kind: "space", id }),
    lessons(db, scope, { spaceId: id }),
    editedBy(place),
  ]);
  const canEdit = roleAtLeast(user.role, "member");
  const parent = place.path.at(-1);

  return (
    <>
      <PageHeader
        title={place.name}
        subtitle={
          place.path.length
            ? place.path.map((p) => p.name).join(" › ")
            : undefined
        }
        back={
          parent
            ? { href: `/places/${parent.id}`, label: parent.name }
            : { href: "/places", label: "Places" }
        }
        actions={
          canEdit ? (
            <Link
              href={`/places/${id}/edit`}
              aria-label="Edit"
              title="Edit"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunk"
            >
              <Icon name="edit" className="h-5 w-5" />
            </Link>
          ) : null
        }
      />

      <Lessons rows={tips} />

      {place.notes ? (
        <p className="whitespace-pre-wrap px-1 text-[15px] text-ink-2">
          {place.notes}
        </p>
      ) : null}

      {place.children.length > 0 || canEdit ? (
        <Section
          title="Places Inside"
          action={
            canEdit ? (
              <Link
                href={`/places/new?parent=${id}`}
                className="text-sm text-accent"
              >
                Add Place
              </Link>
            ) : null
          }
        >
          {place.children.length ? (
            <List>
              {place.children.map((c) => (
                <Row
                  key={c.id}
                  href={`/places/${c.id}`}
                  icon="place"
                  title={c.name}
                />
              ))}
            </List>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Fixtures"
        action={
          canEdit ? (
            <Link
              href={`/fixtures/new?space=${id}`}
              className="text-sm text-accent"
            >
              Add Fixture
            </Link>
          ) : null
        }
      >
        {fixtures.length ? (
          <List>
            {fixtures.map((t) => (
              <Row
                key={t.id}
                href={`/fixtures/${t.id}`}
                icon={fixtureIcon(t)}
                title={t.name}
                detail={t.category || undefined}
              />
            ))}
          </List>
        ) : null}
      </Section>

      {uses.length || canEdit ? (
        <Section
          title="Parts Used Here"
          action={
            canEdit ? (
              <Link href={`/use?space=${id}`} className="text-sm text-accent">
                Add Part
              </Link>
            ) : null
          }
        >
          {uses.length ? <UseList uses={uses} show="part" /> : null}
        </Section>
      ) : null}

      {notes.length || canEdit ? (
        <Section
          title="Log"
          action={
            <>
              {notes.length > 5 ? (
                <Link
                  href={`/notes?space=${id}`}
                  className="text-sm text-accent"
                >
                  All
                </Link>
              ) : null}
              {canEdit ? (
                <Link
                  href={`/notes/new?space=${id}`}
                  className="text-sm text-accent"
                >
                  Add Entry
                </Link>
              ) : null}
            </>
          }
        >
          {notes.length ? (
            <NoteList rows={notes.slice(0, 5)} on={{ spaceId: id }} />
          ) : null}
        </Section>
      ) : null}

      <HomeboxHere spaceId={id} placeName={place.name} canEdit={canEdit} />
      <DocumentsSection
        owner={{ kind: "space", id }}
        kind="tag"
        canEdit={canEdit}
      />

      {photos.length || canEdit ? (
        <Section title="Photos">
          <div className="flex flex-col gap-3">
            <Photos
              items={photos}
              remove={canEdit ? removeAttachmentAction : undefined}
            />
            {canEdit ? <PhotoUpload owner={`space:${id}`} /> : null}
          </div>
        </Section>
      ) : null}

      <LinksSection owner={{ kind: "space", id }} canEdit={canEdit} />

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  );
}
