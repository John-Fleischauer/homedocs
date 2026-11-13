import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getPart } from "@/lib/parts/parts";
import { getFixture } from "@/lib/fixtures/fixtures";
import { viewer } from "@/lib/web/context";
import { noteOptions } from "@/lib/web/note-options";
import { createNoteAction } from "../actions";
import { NoteForm } from "../note-form";

export const metadata = { title: "New Note" };

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{
    space?: string;
    fixture?: string;
    part?: string;
    contact?: string;
    project?: string;
  }>;
}) {
  await requireRole("member");
  const { scope } = await viewer();
  const p = await searchParams;
  const options = await noteOptions(scope);
  // A note about a fixture is also about its place; a note about a part uses its unit.
  const fixture = p.fixture ? await getFixture(db, scope, p.fixture) : null;
  const part = p.part ? await getPart(db, scope, p.part) : null;
  const back = p.fixture
    ? `/fixtures/${p.fixture}`
    : p.space
      ? `/places/${p.space}`
      : p.part
        ? `/parts/${p.part}`
        : p.project
          ? `/projects/${p.project}`
          : p.contact
            ? `/contacts/${p.contact}`
            : "/notes";
  return (
    <>
      <PageHeader title="New Note" back={{ href: back, label: "Back" }} />
      <NoteForm
        action={createNoteAction}
        options={options}
        initial={{
          spaceId: p.space ?? fixture?.spaceId ?? null,
          fixtureId: p.fixture ?? null,
          supplyId: p.part ?? null,
          contactId: p.contact ?? null,
          projectId: p.project ?? null,
          unit: part?.unit ?? null,
        }}
        submit="Save Note"
      />
    </>
  );
}
