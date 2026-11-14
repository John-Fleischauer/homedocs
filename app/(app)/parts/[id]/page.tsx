import Link from "next/link";
import { Lessons } from "@/components/Lessons";
import { DocumentsSection } from "@/components/DocumentsSection";
import { FormulaTable } from "@/components/FormulaTable";
import { LinksSection } from "@/components/LinksSection";
import { NoteList } from "@/components/NoteList";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Photos } from "@/components/Photos";
import { StoreList } from "@/components/StoreList";
import { LinkButton } from "@/components/ui/Button";
import { Card, Facts, List, Row, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listAttachments } from "@/lib/files/attachments";
import { lessons, listNotes } from "@/lib/notes/notes";
import { parseFormula } from "@/lib/parts/formula";
import { getPart, listUses, partUnits } from "@/lib/parts/parts";
import { fieldGroups, TEMPLATES } from "@/lib/parts/templates";
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
  const units = partUnits(part);
  /*
   * The groups as label/value rows. "Sold By" goes beside the container size
   * (paint's Can), or in the first group when there's no size; only groups with
   * something in them are shown, and a formula shown as a table isn't repeated.
   */
  const all = fieldGroups(part.category);
  const sizeAt = Math.max(
    0,
    all.findIndex((g) => g.fields.some((f) => f.key === "size")),
  );
  const groups = all
    .map((g, i) => ({
      title: g.title,
      facts: [
        ...g.fields
          .filter(
            (f) => part.fields[f.key] && !(formula && f.key === "formula"),
          )
          .map((f) => ({
            label: f.label,
            value: f.multiline ? (
              <span className="whitespace-pre-line">{part.fields[f.key]}</span>
            ) : (
              part.fields[f.key]
            ),
          })),
        ...(i === sizeAt && units.length > 1
          ? [{ label: "Sold By", value: units.join(", ") }]
          : []),
      ],
    }))
    .filter((g) => g.facts.length);

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

      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <Facts items={g.facts} />
        </Section>
      ))}

      {formula ? (
        <Section title="Tint Formula">
          <FormulaTable formula={formula} />
        </Section>
      ) : null}

      <Section
        id="where-to-buy"
        title="Where to Buy"
        action={
          canEdit && part.stores.length === 0 ? (
            <Link
              href={`/parts/${id}/edit#stores`}
              className="text-sm text-accent"
            >
              Add Store
            </Link>
          ) : null
        }
      >
        {part.stores.length ? (
          <StoreList stores={part.stores} />
        ) : (
          <p className="px-1 text-sm text-ink-3">No stores yet</p>
        )}
      </Section>

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
