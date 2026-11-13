import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionFormClient } from "./use-edit";
import { DeleteButton } from "@/components/DeleteButton";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { supplyUses } from "@/lib/db/schema";
import { listUses } from "@/lib/parts/parts";
import { TEMPLATES } from "@/lib/parts/templates";
import { viewer } from "@/lib/web/context";
import { removeUseAction, updateUseAction } from "../../parts/actions";

export const metadata = { title: "Edit Part Use" };

export default async function EditUsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const [row] = await db
    .select({ supplyId: supplyUses.supplyId })
    .from(supplyUses)
    .where(
      and(eq(supplyUses.id, id), eq(supplyUses.propertyId, scope.propertyId)),
    );
  if (!row) notFound();
  const use = (await listUses(db, scope, { supplyId: row.supplyId })).find(
    (u) => u.id === id,
  );
  if (!use) notFound();
  const ownerHref =
    use.owner.kind === "fixture"
      ? `/fixtures/${use.owner.id}`
      : `/places/${use.owner.id}`;
  const back = `/parts/${use.part.id}`;
  const template = TEMPLATES[use.part.category];

  return (
    <>
      <PageHeader
        title={`${use.part.name} in ${use.owner.name}`}
        back={{ href: back, label: use.part.name }}
        actions={
          <LinkButton href={ownerHref}>Open {use.owner.kind}</LinkButton>
        }
      />
      <ActionFormClient
        action={updateUseAction.bind(null, id, back)}
        unit={template.unit}
        finishes={template.finishes}
        ownerKind={use.owner.kind}
        initial={use}
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={removeUseAction.bind(null, id, back)}
          what={`this from ${use.owner.name}`}
          label="Remove"
        />
      </div>
    </>
  );
}
