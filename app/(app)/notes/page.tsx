import { NoteList } from "@/components/NoteList";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listNotes } from "@/lib/notes/notes";
import { getSpace } from "@/lib/places/places";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Log" };

/** "2026-11-25" → "November 2026", the heading its entries sit under. */
function monthOf(day: string): string {
  return new Date(`${day.slice(0, 7)}-01T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const { scope, user } = await viewer();
  const { space } = await searchParams;
  const place = space ? await getSpace(db, scope, space) : null;
  const rows = await listNotes(db, scope, { spaceId: space });
  const canEdit = roleAtLeast(user.role, "member");
  // Newest first already, so each month's entries arrive together.
  const months = new Map<string, typeof rows>();
  for (const row of rows) {
    const month = monthOf(row.note.happenedOn);
    months.set(month, [...(months.get(month) ?? []), row]);
  }
  return (
    <>
      <PageHeader
        title={place ? `Log: ${place.name}` : "Log"}
        back={
          place
            ? { href: `/places/${place.id}`, label: place.name }
            : { href: "/more", label: "More" }
        }
        actions={
          canEdit ? (
            <LinkButton
              href={place ? `/notes/new?space=${place.id}` : "/notes/new"}
              variant="primary"
            >
              Add
            </LinkButton>
          ) : null
        }
      />
      {rows.length ? (
        [...months].map(([month, entries]) => (
          <Section key={month} title={month}>
            <NoteList
              rows={entries}
              on={place ? { spaceId: place.id } : undefined}
            />
          </Section>
        ))
      ) : (
        <EmptyState>No log entries yet</EmptyState>
      )}
    </>
  );
}
