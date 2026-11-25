import Link from "next/link";
import { Lessons } from "@/components/Lessons";
import { NoteList } from "@/components/NoteList";
import { LinkButton } from "@/components/ui/Button";
import { Card, List, Row, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listParts, partUnits } from "@/lib/parts/parts";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { STATUS_LABEL } from "@/lib/projects/projects";
import { getSeries, seriesNotes } from "@/lib/projects/series";
import { editedBy } from "@/lib/web/attribution";
import { viewer } from "@/lib/web/context";
import {
  addMaterialAction,
  removeMaterialAction,
  updateMaterialAction,
} from "../../actions";
import { Checklist } from "../../[id]/parts";
import { Materials } from "../../materials";
import { amountOf, materialViews } from "../../series-view";
import { addSeriesItemAction, removeSeriesItemAction } from "../actions";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const series = await getSeries(db, scope, id);
  const [notes, spaces, parts, edited] = await Promise.all([
    seriesNotes(db, scope, id),
    listSpaces(db, scope),
    listParts(db, scope),
    editedBy(series),
  ]);
  const canEdit = roleAtLeast(user.role, "member");
  const lessons = notes.filter((n) => n.note.nextTime !== "");

  return (
    <>
      <PageHeader
        title={series.title}
        subtitle="Series"
        back={{ href: "/projects", label: "Projects" }}
        actions={
          canEdit ? (
            <Link
              href={`/projects/series/${id}/edit`}
              aria-label="Edit"
              title="Edit"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-card text-ink hover:bg-sunk"
            >
              <Icon name="edit" className="h-5 w-5" />
            </Link>
          ) : null
        }
      />

      {canEdit ? (
        <LinkButton
          href={`/projects/new?series=${id}`}
          variant="primary"
          className="w-full"
        >
          <Icon name="plus" />
          Start Project
        </LinkButton>
      ) : null}

      {series.howTo ? (
        <Card className="mt-4 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">
            Instructions
          </h2>
          <p className="whitespace-pre-wrap wrap-anywhere text-[15px] text-ink-2">
            {series.howTo}
          </p>
        </Card>
      ) : null}

      {series.places.length || series.contact ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {series.places.map((p) => (
            <Link
              key={p.id}
              href={`/places/${p.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 wrap-anywhere text-sm text-ink-2 hover:bg-sunk"
            >
              <Icon name="place" className="h-4 w-4 shrink-0 text-accent" />
              {p.name}
            </Link>
          ))}
          {series.contact ? (
            <Link
              href={`/contacts/${series.contact.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 wrap-anywhere text-sm text-ink-2 hover:bg-sunk"
            >
              <Icon name="contact" className="h-4 w-4 shrink-0 text-accent" />
              {series.contact.name}
            </Link>
          ) : null}
        </div>
      ) : null}

      <Section title="To Do">
        <Checklist
          items={series.items.map(({ item, spaceName }) => ({
            id: item.id,
            text: item.text,
            done: false,
            spaceName,
            quoteLabel: null,
            oneOff: false,
          }))}
          remove={removeSeriesItemAction}
          add={addSeriesItemAction.bind(null, id)}
          places={flattenTree(buildTree(spaces))}
          quotes={[]}
          canEdit={canEdit}
        />
      </Section>

      <Section title="Materials">
        <Materials
          rows={materialViews(series.materials)}
          parts={parts.map(({ part }) => ({
            id: part.id,
            name: part.name,
            units: partUnits(part),
          }))}
          places={flattenTree(buildTree(spaces))}
          canEdit={canEdit}
          onProject={false}
          add={addMaterialAction.bind(null, "series", id)}
          update={updateMaterialAction}
          remove={removeMaterialAction}
        />
      </Section>

      <Section title="Past Projects">
        {series.projects.length ? (
          <List>
            {series.projects.map((p) => (
              <Row
                key={p.id}
                href={`/projects/${p.id}`}
                icon="project"
                title={p.title}
                detail={[
                  STATUS_LABEL[p.status],
                  // Amounts first: on a phone the end of the line is cut off.
                  ...p.materials.map((m) =>
                    [amountOf(m.quantity, m.unit), m.notes || m.name]
                      .filter(Boolean)
                      .join(" "),
                  ),
                ].join(" · ")}
              />
            ))}
          </List>
        ) : null}
      </Section>

      {notes.length ? (
        <Section title="Log">
          <Lessons rows={lessons} />
          <div className="mt-3">
            <NoteList rows={notes} />
          </div>
        </Section>
      ) : null}

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  );
}
