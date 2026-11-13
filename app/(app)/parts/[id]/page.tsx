import Link from "next/link";
import { Lessons } from "@/components/Lessons";
import { DocumentsSection } from "@/components/DocumentsSection";
import { FormulaTable } from "@/components/FormulaTable";
import { LinksSection } from "@/components/LinksSection";
import { NoteList } from "@/components/NoteList";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Photos } from "@/components/Photos";
import { LinkButton, buttonClass } from "@/components/ui/Button";
import { Card, Facts, List, Row, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listAttachments } from "@/lib/files/attachments";
import { lessons, listNotes } from "@/lib/notes/notes";
import { parseFormula } from "@/lib/parts/formula";
import { getPart, listUses, partUnits } from "@/lib/parts/parts";
import { TEMPLATES } from "@/lib/parts/templates";
import { editedBy } from "@/lib/web/attribution";
import { viewer } from "@/lib/web/context";
import { formatQty } from "@/lib/web/format";
import { removeAttachmentAction } from "@/lib/web/shared-actions";

export default async function PartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const part = await getPart(db, scope, id);
  const [uses, notes, photos, tips, edited] = await Promise.all([
    listUses(db, scope, { supplyId: id }),
    listNotes(db, scope, { supplyId: id, limit: 20 }),
    listAttachments(db, scope, { kind: "supply", id }),
    lessons(db, scope, { supplyId: id }),
    editedBy(part),
  ]);
  const canEdit = roleAtLeast(user.role, "member");
  const template = TEMPLATES[part.category];
  const formula =
    part.category === "paint" && part.fields.formula
      ? parseFormula(part.fields.formula)
      : null;

  return (
    <>
      <PageHeader
        title={part.name}
        subtitle={template.label}
        back={{ href: "/parts", label: "Parts" }}
        actions={
          canEdit ? (
            <LinkButton href={`/parts/${id}/edit`}>Edit</LinkButton>
          ) : null
        }
      />

      <Facts
        items={[
          ...template.fields
            .filter((f) => !(formula && f.key === "formula"))
            .map((f) => ({
              label: f.label,
              value:
                f.multiline && part.fields[f.key] ? (
                  <span className="whitespace-pre-line">
                    {part.fields[f.key]}
                  </span>
                ) : (
                  (part.fields[f.key] ?? "")
                ),
            })),
          {
            label: "Sold By",
            value: partUnits(part).length > 1 ? partUnits(part).join(", ") : "",
          },
        ]}
      />

      {formula ? (
        <Section title="Tint Formula">
          <FormulaTable formula={formula} />
        </Section>
      ) : null}

      {part.buyUrl ? (
        <a
          href={part.buyUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonClass("secondary", "mt-3 w-full")}
        >
          <Icon name="external" />
          Where to Buy
        </a>
      ) : null}

      <Lessons rows={tips} />

      <Section title="Used In">
        {uses.length ? (
          <List>
            {uses.map((u) => (
              <Row
                key={u.id}
                href={
                  canEdit
                    ? `/use/${u.id}`
                    : u.owner.kind === "fixture"
                      ? `/fixtures/${u.owner.id}`
                      : `/places/${u.owner.id}`
                }
                icon={u.owner.kind === "fixture" ? "fixture" : "place"}
                title={u.owner.name}
                detail={[
                  u.owner.path,
                  [u.surface, u.finish].filter(Boolean).join(", "),
                  formatQty(u.quantity, u.unit),
                  u.quantityNeeded
                    ? `really needs ${formatQty(u.quantityNeeded, u.unit)}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </List>
        ) : (
          <p className="px-1 text-sm text-ink-3">Not used anywhere yet</p>
        )}
      </Section>

      {part.notes ? (
        <Section title="Notes">
          <Card className="px-4 py-3">
            <p className="whitespace-pre-wrap text-[15px] text-ink-2">
              {part.notes}
            </p>
          </Card>
        </Section>
      ) : null}

      <Section
        title="History"
        action={
          canEdit ? (
            <Link
              href={`/notes/new?part=${id}`}
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

      <Section title="Photos">
        <div className="flex flex-col gap-3">
          <Photos
            items={photos}
            remove={canEdit ? removeAttachmentAction : undefined}
          />
          {canEdit ? (
            <PhotoUpload
              owner={`supply:${id}`}
              label={
                part.category === "paint" ? "Add Photo of Label" : "Add Photo"
              }
            />
          ) : null}
        </div>
      </Section>

      <DocumentsSection owner={{ kind: "supply", id }} canEdit={canEdit} />
      <LinksSection owner={{ kind: "supply", id }} canEdit={canEdit} />

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  );
}
