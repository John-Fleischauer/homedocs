import { NoteList } from "@/components/NoteList";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listNotes } from "@/lib/notes/notes";
import { getSpace } from "@/lib/places/places";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Notes" };

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
  return (
    <>
      <PageHeader
        title={place ? `Notes: ${place.name}` : "Notes"}
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
        <NoteList rows={rows} />
      ) : (
        <EmptyState>No notes yet</EmptyState>
      )}
    </>
  );
}
