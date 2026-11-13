import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { getTradeGroups } from "@/lib/contacts/trades";
import { db } from "@/lib/db";
import { getSystem } from "@/lib/systems/systems";
import { viewer } from "@/lib/web/context";
import { deleteSystemAction, updateSystemAction } from "../../actions";
import { SystemForm } from "../../system-form";

export const metadata = { title: "Edit System" };

export default async function EditSystemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const system = await getSystem(db, scope, id);
  return (
    <>
      <PageHeader
        title={`Edit ${system.name}`}
        back={{ href: `/systems/${id}`, label: system.name }}
      />
      <SystemForm
        action={updateSystemAction.bind(null, id)}
        groups={await getTradeGroups(db, scope)}
        initial={{ ...system, updatedAt: system.updatedAt.toISOString() }}
        submit="Save"
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deleteSystemAction.bind(null, id)}
          what={`“${system.name}” (its fixtures stay where they are)`}
        />
      </div>
    </>
  );
}
