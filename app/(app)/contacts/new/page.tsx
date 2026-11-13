import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { getTradeGroups } from "@/lib/contacts/trades";
import { db } from "@/lib/db";
import { viewer } from "@/lib/web/context";
import { createContactAction } from "../actions";
import { ContactForm } from "../contact-form";

export const metadata = { title: "New Contact" };

export default async function NewContactPage() {
  await requireRole("member");
  const { scope } = await viewer();
  return (
    <>
      <PageHeader
        title="New Contact"
        back={{ href: "/contacts", label: "Contacts" }}
      />
      <ContactForm
        action={createContactAction}
        groups={await getTradeGroups(db, scope)}
        submit="Add Contact"
      />
    </>
  );
}
