import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getContact } from "@/lib/contacts/contacts";
import { getTradeGroups } from "@/lib/contacts/trades";
import { viewer } from "@/lib/web/context";
import { deleteContactAction, updateContactAction } from "../../actions";
import { ContactForm } from "../../contact-form";

export const metadata = { title: "Edit Contact" };

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const contact = await getContact(db, scope, id);
  return (
    <>
      <PageHeader
        title={`Edit ${contact.name}`}
        back={{ href: `/contacts/${id}`, label: contact.name }}
      />
      <ContactForm
        action={updateContactAction.bind(null, id)}
        groups={await getTradeGroups(db, scope)}
        initial={{ ...contact, updatedAt: contact.updatedAt.toISOString() }}
        submit="Save"
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deleteContactAction.bind(null, id)}
          what={`“${contact.name}”`}
        />
      </div>
    </>
  );
}
