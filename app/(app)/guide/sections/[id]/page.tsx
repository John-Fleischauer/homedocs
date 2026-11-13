import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getSection } from "@/lib/guide/guide";
import { viewer } from "@/lib/web/context";
import { deleteSectionAction, saveSectionAction } from "../../actions";
import { SectionForm } from "../../forms";

export const metadata = { title: "Guide Note" };

export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  if (id === "new") {
    return (
      <>
        <PageHeader
          title="New Guide Note"
          back={{ href: "/guide/edit", label: "Edit Guide" }}
        />
        <SectionForm action={saveSectionAction.bind(null, null)} />
      </>
    );
  }
  const s = await getSection(db, scope, id);
  return (
    <>
      <PageHeader
        title={s.title}
        back={{ href: "/guide/edit", label: "Edit Guide" }}
      />
      <SectionForm
        action={saveSectionAction.bind(null, id)}
        initial={{ ...s, updatedAt: s.updatedAt.toISOString() }}
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deleteSectionAction.bind(null, id)}
          what={`“${s.title}”`}
        />
      </div>
    </>
  );
}
