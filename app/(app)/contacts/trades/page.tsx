import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { getTradeGroups } from "@/lib/contacts/trades";
import { db } from "@/lib/db";
import { viewer } from "@/lib/web/context";
import { saveTradesAction } from "../actions";
import { TradeListForm } from "./trade-list-form";

export const metadata = { title: "Trades" };

export default async function TradesPage() {
  await requireRole("member");
  const { scope } = await viewer();
  return (
    <>
      <PageHeader
        title="Trades"
        subtitle="Choices on the contact and system forms"
        back={{ href: "/contacts", label: "Contacts" }}
      />
      <TradeListForm
        action={saveTradesAction}
        initial={await getTradeGroups(db, scope)}
      />
    </>
  );
}
