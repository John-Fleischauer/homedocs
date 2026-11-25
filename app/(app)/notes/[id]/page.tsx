import Link from "next/link";
import { DocumentsSection } from "@/components/DocumentsSection";
import { LinksSection } from "@/components/LinksSection";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Photos } from "@/components/Photos";
import { Card, Facts, List, Row, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listAttachments } from "@/lib/files/attachments";
import { listNotes, suggestedNeed } from "@/lib/notes/notes";
import { listUses } from "@/lib/parts/parts";
import { editedBy } from "@/lib/web/attribution";
import { viewer } from "@/lib/web/context";
import { formatDay, formatMoney, formatQty, plural } from "@/lib/web/format";
import { removeAttachmentAction } from "@/lib/web/shared-actions";
import { notFound } from "next/navigation";
import { ApplyNeed } from "./apply-need";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const [row] = await listNotes(db, scope, { id });
  if (!row) notFound();
  const { note } = row;
  const [photos, edited] = await Promise.all([
    listAttachments(db, scope, { kind: "log", id }),
    editedBy(note),
  ]);
  const canEdit = roleAtLeast(user.role, "member");

  // The one-tap "amount needed" update, when this entry's lesson has a number in it.
  const need = suggestedNeed(note);
  let applicable: { unit: string } | null = null;
  let remembered: string | null = null;
  if (need !== null && note.supplyId && (note.spaceId || note.fixtureId)) {
    const uses = await listUses(
      db,
      scope,
      note.fixtureId
        ? { fixtureId: note.fixtureId }
        : { spaceId: note.spaceId! },
    );
    const use = uses.find((u) => u.part.id === note.supplyId);
    const unit = plural(use?.unit || note.unit || "");
    if (use && Number(use.quantityNeeded ?? NaN) === need)
      remembered = `Amount needed for ${use.owner.name}: ${need} ${unit}`;
    else if (use && canEdit) applicable = { unit };
  }

  const about = [
    row.spaceName && note.spaceId
      ? {
          href: `/places/${note.spaceId}`,
          label: row.spaceName,
          icon: "place" as const,
          kind: "Place",
        }
      : null,
    row.fixtureName && note.fixtureId
      ? {
          href: `/fixtures/${note.fixtureId}`,
          label: row.fixtureName,
          icon: "fixture" as const,
          kind: "Fixture",
        }
      : null,
    row.supplyName && note.supplyId
      ? {
          href: `/parts/${note.supplyId}`,
          label: row.supplyName,
          icon: "part" as const,
          kind: "Part",
        }
      : null,
    row.contactName && note.contactId
      ? {
          href: `/contacts/${note.contactId}`,
          label: row.contactName,
          icon: "contact" as const,
          kind: "Done By",
        }
      : null,
    row.projectTitle && note.projectId
      ? {
          href: `/projects/${note.projectId}`,
          label: row.projectTitle,
          icon: "project" as const,
          kind: "Project",
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <PageHeader
        title={note.title}
        subtitle={formatDay(note.happenedOn)}
        back={{ href: "/notes", label: "Log" }}
        actions={
          canEdit ? (
            <Link
              href={`/notes/${id}/edit`}
              aria-label="Edit"
              title="Edit"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunk"
            >
              <Icon name="edit" className="h-5 w-5" />
            </Link>
          ) : null
        }
      />

      {note.nextTime ? (
        <div className="rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-warn">
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            Next Time
          </h2>
          <p className="mt-0.5 whitespace-pre-wrap wrap-anywhere text-[15px]">
            {note.nextTime}
          </p>
          {note.remindAfter ? (
            <p className="mt-1 text-xs">
              Reminder {formatDay(note.remindAfter)}
            </p>
          ) : null}
          {applicable && need !== null ? (
            <ApplyNeed noteId={id} need={need} unit={applicable.unit} />
          ) : null}
          {remembered ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
              {remembered}
            </p>
          ) : null}
        </div>
      ) : note.remindAfter ? (
        <Facts
          items={[{ label: "Reminder", value: formatDay(note.remindAfter) }]}
        />
      ) : null}

      {about.length ? (
        <Section title="About">
          <List>
            {about.map((a) => (
              <Row
                key={a.href}
                href={a.href}
                icon={a.icon}
                title={a.label}
                detail={a.kind}
              />
            ))}
          </List>
        </Section>
      ) : null}

      <div className="mt-4">
        <Facts
          items={[
            { label: "Amount", value: formatQty(note.quantity, note.unit) },
            { label: "Cost", value: formatMoney(note.cost) },
          ]}
        />
      </div>

      {note.body ? (
        <Section title="Notes">
          <Card className="px-4 py-3">
            <p className="whitespace-pre-wrap text-[15px] text-ink-2">
              {note.body}
            </p>
          </Card>
        </Section>
      ) : null}

      <Section title="Photos and Files">
        <div className="flex flex-col gap-3">
          <Photos
            items={photos}
            remove={canEdit ? removeAttachmentAction : undefined}
          />
          {canEdit ? (
            <PhotoUpload owner={`log:${id}`} label="Add Photo or File" />
          ) : null}
        </div>
      </Section>

      <DocumentsSection owner={{ kind: "log", id }} canEdit={canEdit} />
      <LinksSection owner={{ kind: "log", id }} canEdit={canEdit} />

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  );
}
