import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { isCategory } from "@/lib/parts/templates";
import { viewer } from "@/lib/web/context";
import { ownerFromParams } from "@/lib/web/owner";
import { createPartAction } from "../actions";
import { PartForm } from "../part-form";

export const metadata = { title: "New Part" };

export default async function NewPartPage({
  searchParams,
}: {
  searchParams: Promise<{
    fixture?: string;
    space?: string;
    category?: string;
  }>;
}) {
  await requireRole("member");
  const { scope } = await viewer();
  const params = await searchParams;
  const owner = await ownerFromParams(scope, params);
  return (
    <>
      <PageHeader
        title="New Part"
        subtitle={owner ? `For ${owner.name}` : undefined}
        back={
          owner
            ? { href: owner.href, label: owner.name }
            : { href: "/parts", label: "Parts" }
        }
      />
      <PartForm
        action={createPartAction}
        owner={owner}
        initial={{
          category:
            params.category && isCategory(params.category)
              ? params.category
              : undefined,
        }}
        submit={owner ? `Add to ${owner.name}` : "Add Part"}
      />
    </>
  );
}
