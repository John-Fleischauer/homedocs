import { EmptyState, List, Row } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { listFixtures } from "@/lib/fixtures/fixtures";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Fixtures" };

export default async function FixturesPage() {
  const { scope, user } = await viewer();
  const [fixtures, spaceRows] = await Promise.all([
    listFixtures(db, scope),
    listSpaces(db, scope),
  ]);
  const labels = new Map(
    flattenTree(buildTree(spaceRows)).map((p) => [p.id, p.label]),
  );
  const canEdit = roleAtLeast(user.role, "member");
  const sorted = [...fixtures].sort((a, b) =>
    `${labels.get(a.spaceId ?? "") ?? ""} ${a.name}`.localeCompare(
      `${labels.get(b.spaceId ?? "") ?? ""} ${b.name}`,
    ),
  );
  return (
    <>
      <PageHeader
        title="Fixtures"
        back={{ href: "/more", label: "More" }}
        actions={
          canEdit ? (
            <LinkButton href="/fixtures/new" variant="primary">
              Add
            </LinkButton>
          ) : null
        }
      />
      {sorted.length ? (
        <List>
          {sorted.map((t) => (
            <Row
              key={t.id}
              href={`/fixtures/${t.id}`}
              icon="fixture"
              title={t.name}
              detail={[labels.get(t.spaceId ?? "") ?? "Whole house", t.category]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </List>
      ) : (
        <EmptyState>No fixtures yet</EmptyState>
      )}
    </>
  );
}
