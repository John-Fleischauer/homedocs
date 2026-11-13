import Link from "next/link";
import { Lessons } from "@/components/Lessons";
import { DocumentsSection } from "@/components/DocumentsSection";
import { LinksSection } from "@/components/LinksSection";
import { NoteList } from "@/components/NoteList";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Photos } from "@/components/Photos";
import { UseList } from "@/components/UseList";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { Card, Pill, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listAttachments } from "@/lib/files/attachments";
import { lessons, listNotes } from "@/lib/notes/notes";
import { listUses } from "@/lib/parts/parts";
import { getFixture } from "@/lib/fixtures/fixtures";
import { systemIcon } from "@/lib/systems/seeds";
import { editedBy } from "@/lib/web/attribution";
import { viewer } from "@/lib/web/context";
import { removeAttachmentAction } from "@/lib/web/shared-actions";

export default async function FixturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const fixture = await getFixture(db, scope, id);
  const [uses, notes, photos, tips, edited] = await Promise.all([
    listUses(db, scope, { fixtureId: id }),
    listNotes(db, scope, { fixtureId: id, limit: 20 }),
    listAttachments(db, scope, { kind: "fixture", id }),
    lessons(db, scope, { fixtureId: id }),
    editedBy(fixture),
  ]);
  const canEdit = roleAtLeast(user.role, "member");
  const place = fixture.path.at(-1);

  return (
    <>
      <PageHeader
        title={fixture.name}
        subtitle={[
          fixture.path.map((p) => p.name).join(" › ") || "Whole house",
          fixture.category,
        ]
          .filter(Boolean)
          .join(" · ")}
        back={
          place
            ? { href: `/places/${place.id}`, label: place.name }
            : { href: "/fixtures", label: "Fixtures" }
        }
        actions={
          canEdit ? (
            <LinkButton href={`/fixtures/${id}/edit`}>Edit</LinkButton>
          ) : null
        }
      />

      {fixture.system ? (
        <Link
          href={`/systems/${fixture.system.id}`}
          className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-4 text-sm font-medium text-accent"
        >
          <Icon name={systemIcon(fixture.system.icon)} className="h-4 w-4" />
          {fixture.system.name}
        </Link>
      ) : null}

      {photos.length ? (
        <div className="flex flex-col gap-2">
          <Photos
            items={photos}
            hero
            remove={canEdit ? removeAttachmentAction : undefined}
          />
          {canEdit ? (
            <PhotoUpload owner={`fixture:${id}`} label="Add Photo" />
          ) : null}
        </div>
      ) : canEdit ? (
        <PhotoUpload
          owner={`fixture:${id}`}
          tile={{ title: "Add Photo", hint: "Where it is, or its label" }}
        />
      ) : null}

      <Lessons rows={tips} />

      <Section
        title="Parts"
        action={
          canEdit ? (
            <Link href={`/use?fixture=${id}`} className="text-sm text-accent">
              Add Part
            </Link>
          ) : null
        }
      >
        {uses.length ? (
          <UseList uses={uses} show="part" />
        ) : (
          <p className="px-1 text-sm text-ink-3">None yet</p>
        )}
      </Section>

      {fixture.notes ? (
        <Section title="About">
          <Card className="px-4 py-3">
            <p className="whitespace-pre-wrap text-[15px] text-ink-2">
              {fixture.notes}
            </p>
          </Card>
        </Section>
      ) : null}

      {fixture.inGuide ? (
        <Section title="On House Guide">
          <Card className="px-4 py-3">
            <Pill tone="accent">Shown to Housesitters</Pill>
            {fixture.guideNote ? (
              <p className="mt-2 whitespace-pre-wrap text-[15px] text-ink-2">
                {fixture.guideNote}
              </p>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section
        title="Notes"
        action={
          canEdit ? (
            <Link
              href={`/notes/new?fixture=${id}`}
              className="text-sm text-accent"
            >
              Add Note
            </Link>
          ) : null
        }
      >
        {notes.length ? (
          <NoteList rows={notes} />
        ) : (
          <p className="px-1 text-sm text-ink-3">None yet</p>
        )}
      </Section>

      <DocumentsSection owner={{ kind: "fixture", id }} canEdit={canEdit} />
      <LinksSection owner={{ kind: "fixture", id }} canEdit={canEdit} />

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  );
}
