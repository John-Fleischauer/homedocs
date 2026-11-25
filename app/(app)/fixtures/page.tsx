import { EmptyState, List, Row } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { kindIcon } from "@/lib/fixtures/kind-labels";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { listFixtures, type Fixture } from "@/lib/fixtures/fixtures";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Fixtures" };

/* By place, whole-house fixtures first, then places in the order the Places list has them. Each row says what kind it is, in its icon and under its name. */
export default async function FixturesPage() {
  const { scope, user } = await viewer();
  const [fixtures, spaceRows] = await Promise.all([
    listFixtures(db, scope),
    listSpaces(db, scope),
  ]);
  const places = flattenTree(buildTree(spaceRows));
  const canEdit = roleAtLeast(user.role, "member");
  const groups: { key: string; label: string; items: Fixture[] }[] = [
    { key: "", label: "Whole House" },
    ...places.map((p) => ({ key: p.id, label: p.label })),
  ]
    .map((g) => ({
      ...g,
      items: fixtures.filter((f) => (f.spaceId ?? "") === g.key),
    }))
    .filter((g) => g.items.length);
  return (
    <>
      <PageHeader
        title="Fixtures"
        back={{ href: "/more", label: "More" }}
        actions={
          canEdit && groups.length ? (
            <LinkButton href="/fixtures/new" variant="primary">
              Add
            </LinkButton>
          ) : null
        }
      />
      {groups.length ? (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-1.5 px-1 wrap-anywhere text-xs font-medium uppercase tracking-wide text-ink-3">
                {g.label}
              </h2>
              <List>
                {g.items.map((f) => (
                  <Row
                    key={f.id}
                    href={`/fixtures/${f.id}`}
                    icon={kindIcon(f.category)}
                    title={f.name}
                    detail={f.category || undefined}
                  />
                ))}
              </List>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            canEdit ? (
              <LinkButton href="/fixtures/new" variant="primary">
                Add Fixture
              </LinkButton>
            ) : null
          }
        >
          No fixtures yet
        </EmptyState>
      )}
    </>
  );
}
