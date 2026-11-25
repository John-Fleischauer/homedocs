import { EmptyState, List, Row, Section } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listParts } from "@/lib/parts/parts";
import {
  CATEGORIES,
  summarize,
  TEMPLATES,
  type Category,
} from "@/lib/parts/templates";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Parts" };

/* A part's details for its row, less whatever its name already says ("A19 E26 2700K bulb"). */
function beyondName(
  name: string,
  category: Category,
  fields: Record<string, string>,
): string {
  const said = name.toLowerCase();
  return summarize(category, fields)
    .split(" · ")
    .filter((piece) => piece && !said.includes(piece.toLowerCase()))
    .join(" · ");
}

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
              Add Part
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
                        beyondName(part.name, part.category, part.fields),
                        uses
                          ? `Used in ${uses} place${uses === 1 ? "" : "s"}`
                          : "Not used anywhere",
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
