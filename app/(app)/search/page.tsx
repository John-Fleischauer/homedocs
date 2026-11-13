import { SearchBox } from "@/components/SearchBox";
import { EmptyState, List, Row } from "@/components/ui/Card";
import type { IconName } from "@/components/ui/icons";
import { db } from "@/lib/db";
import { KIND_PATH, search, type SearchKind } from "@/lib/search/search";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Search" };

const ICON: Record<SearchKind, IconName> = {
  place: "place",
  system: "system",
  fixture: "fixture",
  part: "part",
  note: "note",
  contact: "contact",
  project: "project",
  series: "project",
};

const KIND_LABEL: Record<SearchKind, string> = {
  place: "Place",
  system: "System",
  fixture: "Fixture",
  part: "Part",
  note: "Note",
  contact: "Contact",
  project: "Project",
  series: "Series",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { scope } = await viewer();
  const q = ((await searchParams).q ?? "").slice(0, 200);
  const hits = q.trim() ? await search(db, scope, q) : [];

  return (
    <>
      <h1 className="sr-only">Search</h1>
      <SearchBox defaultValue={q} focus={!q} />
      <div className="mt-4">
        {q.trim() === "" ? null : hits.length === 0 ? (
          <EmptyState>Nothing matches “{q}”.</EmptyState>
        ) : (
          <List>
            {hits.map((hit) => (
              <Row
                key={`${hit.kind}-${hit.id}`}
                href={`${KIND_PATH[hit.kind]}/${hit.id}`}
                icon={ICON[hit.kind]}
                title={hit.title}
                detail={[KIND_LABEL[hit.kind], hit.detail]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </List>
        )}
      </div>
    </>
  );
}
