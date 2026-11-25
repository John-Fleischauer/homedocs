import Link from "next/link";
import { Icon } from "@/components/ui/icons";
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
          Starts with{" "}
          {series.items.length === 1
            ? "1 to-do"
            : `${series.items.length} to-dos`}{" "}
          and{" "}
          {series.materials.length === 1
            ? "1 material"
            : `${series.materials.length} materials`}
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
        <section className="mb-5">
          <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-3">
            Start from a Series
          </h2>
          <div className="flex flex-wrap gap-2">
            {allSeries.map((s) => (
              <Link
                key={s.id}
                href={`/projects/new?series=${s.id}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-card py-1.5 pl-4 pr-2.5 wrap-anywhere text-sm text-ink-2 hover:bg-sunk"
              >
                {s.title}
                <Icon name="chevron" className="h-4 w-4 shrink-0 text-ink-3" />
              </Link>
            ))}
          </div>
          <h2 className="mt-5 px-1 text-sm font-semibold uppercase tracking-wide text-ink-3">
            Or a New Job
          </h2>
        </section>
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
