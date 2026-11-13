import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listSecrets } from "@/lib/guide/guide";
import { viewer } from "@/lib/web/context";
import { deleteSecretAction, saveSecretAction } from "../../actions";
import { SecretForm } from "../../forms";

export const metadata = { title: "Code" };

export default async function CodePage({
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
          title="New Code"
          back={{ href: "/guide/edit", label: "Edit Guide" }}
        />
        <SecretForm action={saveSecretAction.bind(null, null)} />
      </>
    );
  }
  const code = (await listSecrets(db, scope)).find((c) => c.id === id);
  if (!code) notFound();
  return (
    <>
      <PageHeader
        title={code.label}
        back={{ href: "/guide/edit", label: "Edit Guide" }}
      />
      <SecretForm
        action={saveSecretAction.bind(null, id)}
        initial={{
          ...code,
          ssid: code.meta.ssid,
          security: code.meta.security,
        }}
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deleteSecretAction.bind(null, id)}
          what={`“${code.label}”`}
        />
      </div>
    </>
  );
}
