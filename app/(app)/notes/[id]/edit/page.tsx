import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getNote } from "@/lib/notes/notes";
import { viewer } from "@/lib/web/context";
import { noteOptions } from "@/lib/web/note-options";
import { deleteNoteAction, updateNoteAction } from "../../actions";
import { NoteForm } from "../../note-form";

export const metadata = { title: "Edit Entry" };

export default async function EditNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const note = await getNote(db, scope, id);
  return (
    <>
      <PageHeader
        title="Edit Entry"
        back={{ href: `/notes/${id}`, label: note.title }}
      />
      <NoteForm
        action={updateNoteAction.bind(null, id)}
        options={await noteOptions(scope)}
        initial={{ ...note, updatedAt: note.updatedAt.toISOString() }}
        submit="Save"
      />
      <div className="mt-6 flex justify-end border-t border-line pt-3">
        <DeleteButton
          compact
          action={deleteNoteAction.bind(null, id)}
          what="this log entry"
        />
      </div>
    </>
  );
}
