import Link from "next/link";
import { EmptyState, Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { buildTree, listSpaces, type SpaceNode } from "@/lib/places/places";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Places" };

function Branch({ nodes }: { nodes: SpaceNode[] }) {
  return (
    <ul className="divide-y divide-line">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            href={`/places/${n.id}`}
            className="flex min-h-13 items-center gap-3 py-3 pr-4 hover:bg-sunk"
            style={{ paddingLeft: `${1 + n.depth * 1.25}rem` }}
          >
            <Icon
              name={n.depth === 0 ? "place" : "chevron"}
              className={
                n.depth === 0
                  ? "h-5 w-5 shrink-0 text-accent"
                  : "h-4 w-4 shrink-0 text-ink-3"
              }
            />
            <span
              className={`min-w-0 flex-1 wrap-anywhere text-[15px] ${n.depth === 0 ? "font-medium" : ""}`}
            >
              {n.name}
            </span>
            {n.children.length ? (
              <span className="shrink-0 text-xs text-ink-3">
                {n.children.length} inside
              </span>
            ) : null}
          </Link>
          {n.children.length ? <Branch nodes={n.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function PlacesPage() {
  const { scope, user } = await viewer();
  const tree = buildTree(await listSpaces(db, scope));
  const canEdit = roleAtLeast(user.role, "member");
  return (
    <>
      <PageHeader
        title="Places"
        actions={
          canEdit ? (
            <LinkButton href="/places/new" variant="primary">
              Add
            </LinkButton>
          ) : null
        }
      />
      {tree.length === 0 ? (
        <EmptyState
          action={
            canEdit ? (
              <LinkButton href="/places/new" variant="primary">
                Add Place
              </LinkButton>
            ) : null
          }
        >
          No places yet
        </EmptyState>
      ) : (
        <Card>
          <Branch nodes={tree} />
        </Card>
      )}
    </>
  );
}
