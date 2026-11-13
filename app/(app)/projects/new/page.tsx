import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { listContacts } from "@/lib/contacts/contacts";
import { db } from "@/lib/db";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { getSeries, listSeries, nextTitle } from "@/lib/projects/series";
import { viewer } from "@/lib/web/context";
import { createProjectAction } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata = { title: "New Project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; series?: string }>;
}) {
  await requireRole("member");
  const { scope } = await viewer();
  const { space, series: seriesId } = await searchParams;
  const [spaces, contacts, allSeries] = await Promise.all([
    listSpaces(db, scope),
    listContacts(db, scope),
    listSeries(db, scope),
  ]);
  const places = flattenTree(buildTree(spaces));
  const contactOptions = contacts.map((c) => ({
    id: c.id,
    label: c.company ? `${c.name} (${c.company})` : c.name,
  }));
  const series = seriesId ? await getSeries(db, scope, seriesId) : null;

  if (series) {
    return (
      <>
        <PageHeader
          title={`New ${series.title}`}
          back={{ href: `/projects/series/${series.id}`, label: series.title }}
        />
        <p className="mb-4 rounded-control bg-accent-soft px-3 py-2 text-sm text-accent">
          Starts with the series’{" "}
          {series.items.length === 1
            ? "1 to-do"
            : `${series.items.length} to-dos`}{" "}
          and{" "}
          {series.materials.length === 1
            ? "1 material"
            : `${series.materials.length} materials`}
          .
        </p>
        <ProjectForm
          action={createProjectAction}
          places={places}
          contacts={contactOptions}
          initial={{
            title: await nextTitle(db, scope, series),
            status: "planning",
            seriesId: series.id,
            spaceIds: series.places.map((p) => p.id),
            contactId: series.contactId,
          }}
          submit="Start Project"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New Project"
        back={{ href: "/projects", label: "Projects" }}
      />
      {allSeries.length ? (
        <div className="mb-4 flex flex-col gap-2">
          <p className="px-1 text-sm text-ink-3">Start from a series</p>
          <div className="flex flex-wrap gap-2">
            {allSeries.map((s) => (
              <Link
                key={s.id}
                href={`/projects/new?series=${s.id}`}
                className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-sm text-ink-2"
              >
                {s.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <ProjectForm
        action={createProjectAction}
        places={places}
        contacts={contactOptions}
        initial={{ spaceIds: space ? [space] : [] }}
        submit="Add Project"
      />
    </>
  );
}
