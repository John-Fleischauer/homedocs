import { List, Row } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { addItems } from "@/lib/web/add-items";

export const metadata = { title: "Add" };

export default async function AddPage() {
  await requireRole("member");
  return (
    <>
      <PageHeader title="Add" subtitle="Tap + on a place to fill in where" />
      <List>
        {addItems().map((item) => (
          <Row
            key={item.title}
            href={item.href}
            icon={item.icon}
            title={item.title}
            detail={item.detail}
          />
        ))}
      </List>
    </>
  );
}
