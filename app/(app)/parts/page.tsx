import { EmptyState, List, Row, Section } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listParts } from "@/lib/parts/parts";
import { CATEGORIES, summarize, TEMPLATES } from "@/lib/parts/templates";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Parts" };

export default async function PartsPage() {
  const { scope, user } = await viewer();
  const rows = await listParts(db, scope);
  const canEdit = roleAtLeast(user.role, "member");
  return (
    <>
      <PageHeader
        title="Parts"
        back={{ href: "/more", label: "More" }}
        actions={
          canEdit ? (
            <LinkButton href="/parts/new" variant="primary">
              Add
            </LinkButton>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState>No parts yet</EmptyState>
      ) : (
        CATEGORIES.filter((c) => rows.some((r) => r.part.category === c)).map(
          (c) => (
            <Section key={c} title={TEMPLATES[c].label}>
              <List>
                {rows
                  .filter((r) => r.part.category === c)
                  .map(({ part, uses }) => (
                    <Row
                      key={part.id}
                      href={`/parts/${part.id}`}
                      icon="part"
                      title={part.name}
                      detail={[
                        summarize(part.category, part.fields),
                        uses
                          ? `used in ${uses} place${uses === 1 ? "" : "s"}`
                          : "not linked yet",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
              </List>
            </Section>
          ),
        )
      )}
    </>
  );
}
