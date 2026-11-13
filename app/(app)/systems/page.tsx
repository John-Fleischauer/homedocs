import { systemDetail } from "@/components/SystemTiles";
import { List, Row } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { systemIcon } from "@/lib/systems/seeds";
import { listSystems } from "@/lib/systems/systems";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Systems" };

export default async function SystemsPage() {
  const { scope, user } = await viewer();
  const systems = await listSystems(db, scope);
  const canEdit = roleAtLeast(user.role, "member");
  return (
    <>
      <PageHeader
        title="Systems"
        back={{ href: "/more", label: "More" }}
        actions={
          canEdit ? <LinkButton href="/systems/new">Add</LinkButton> : null
        }
      />
      <List>
        {systems.map((s) => (
          <Row
            key={s.id}
            href={`/systems/${s.id}`}
            icon={systemIcon(s.icon)}
            title={s.name}
            detail={systemDetail(s)}
          />
        ))}
      </List>
    </>
  );
}
