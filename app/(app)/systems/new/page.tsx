import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { viewer } from "@/lib/web/context";
import { getTradeGroups } from "@/lib/contacts/trades";
import { createSystemAction } from "../actions";
import { SystemForm } from "../system-form";

export const metadata = { title: "New System" };

export default async function NewSystemPage() {
  await requireRole("member");
  const { scope } = await viewer();
  return (
    <>
      <PageHeader
        title="New System"
        back={{ href: "/systems", label: "Systems" }}
      />
      <SystemForm
        action={createSystemAction}
        groups={await getTradeGroups(db, scope)}
        submit="Add System"
      />
    </>
  );
}
