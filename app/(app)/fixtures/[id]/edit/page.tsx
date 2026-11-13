import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { getFixture, FIXTURE_CATEGORIES } from "@/lib/fixtures/fixtures";
import { listSystemChoices } from "@/lib/systems/systems";
import { viewer } from "@/lib/web/context";
import { deleteFixtureAction, updateFixtureAction } from "../../actions";
import { FixtureForm } from "../../fixture-form";

export const metadata = { title: "Edit Fixture" };

export default async function EditFixturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const fixture = await getFixture(db, scope, id);
  const [places, systems] = await Promise.all([
    listSpaces(db, scope).then((rows) => flattenTree(buildTree(rows))),
    listSystemChoices(db, scope),
  ]);
  return (
    <>
      <PageHeader
        title={`Edit ${fixture.name}`}
        back={{ href: `/fixtures/${id}`, label: fixture.name }}
      />
      <FixtureForm
        action={updateFixtureAction.bind(null, id)}
        places={places}
        systems={systems}
        categories={FIXTURE_CATEGORIES}
        initial={{ ...fixture, updatedAt: fixture.updatedAt.toISOString() }}
        submit="Save"
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deleteFixtureAction.bind(
            null,
            id,
            fixture.spaceId ? `/places/${fixture.spaceId}` : "/fixtures",
          )}
          what={`“${fixture.name}”`}
        />
      </div>
    </>
  );
}
