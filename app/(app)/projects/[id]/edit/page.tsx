import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listContacts } from "@/lib/contacts/contacts";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { getProject } from "@/lib/projects/projects";
import { viewer } from "@/lib/web/context";
import { deleteProjectAction, updateProjectAction } from "../../actions";
import { ProjectForm } from "../../project-form";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const project = await getProject(db, scope, id);
  const places = flattenTree(buildTree(await listSpaces(db, scope)));
  const contacts = (await listContacts(db, scope)).map((c) => ({
    id: c.id,
    label: c.company ? `${c.name} (${c.company})` : c.name,
  }));
  return (
    <>
      <PageHeader
        title={`Edit ${project.title}`}
        back={{ href: `/projects/${id}`, label: project.title }}
      />
      <ProjectForm
        action={updateProjectAction.bind(null, id)}
        places={places}
        contacts={contacts}
        initial={{
          title: project.title,
          status: project.status,
          priority: project.priority,
          targetDate: project.targetDate,
          summary: project.summary,
          contactId: project.contactId,
          spaceIds: project.places.map((p) => p.id),
          updatedAt: project.updatedAt.toISOString(),
        }}
        submit="Save"
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deleteProjectAction.bind(null, id)}
          what={`“${project.title}”`}
        />
      </div>
    </>
  );
}
