import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { listContacts } from "@/lib/contacts/contacts";
import { db } from "@/lib/db";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { getSeries } from "@/lib/projects/series";
import { viewer } from "@/lib/web/context";
import { deleteSeriesAction, saveSeriesAction } from "../../actions";
import { SeriesForm } from "../../series-form";

export const metadata = { title: "Edit Series" };

export default async function EditSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const [series, spaces, contacts] = await Promise.all([
    getSeries(db, scope, id),
    listSpaces(db, scope),
    listContacts(db, scope),
  ]);
  return (
    <>
      <PageHeader
        title={`Edit ${series.title}`}
        back={{ href: `/projects/series/${id}`, label: series.title }}
      />
      <SeriesForm
        action={saveSeriesAction.bind(null, id)}
        places={flattenTree(buildTree(spaces))}
        contacts={contacts.map((c) => ({
          id: c.id,
          label: c.company ? `${c.name} (${c.company})` : c.name,
        }))}
        initial={{
          title: series.title,
          howTo: series.howTo,
          contactId: series.contactId,
          spaceIds: series.places.map((p) => p.id),
          updatedAt: series.updatedAt.toISOString(),
        }}
        submit="Save"
      />
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="px-1 text-sm text-ink-3">
          Its projects stay, with their to-dos and materials
        </p>
        <DeleteButton
          compact
          action={deleteSeriesAction.bind(null, id)}
          what={`“${series.title}”`}
        />
      </div>
    </>
  );
}
