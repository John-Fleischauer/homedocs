import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getPart } from "@/lib/parts/parts";
import { viewer } from "@/lib/web/context";
import { deletePartAction, updatePartAction } from "../../actions";
import { PartForm } from "../../part-form";

export const metadata = { title: "Edit Part" };

export default async function EditPartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const part = await getPart(db, scope, id);
  return (
    <>
      <PageHeader
        title={`Edit ${part.name}`}
        back={{ href: `/parts/${id}`, label: part.name }}
      />
      <PartForm
        action={updatePartAction.bind(null, id)}
        initial={{ ...part, updatedAt: part.updatedAt.toISOString() }}
        submit="Save"
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deletePartAction.bind(null, id)}
          what={`“${part.name}”`}
        />
      </div>
    </>
  );
}
