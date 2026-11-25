import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { getFixtureKinds } from "@/lib/fixtures/kinds";
import { listSystemChoices } from "@/lib/systems/systems";
import { viewer } from "@/lib/web/context";
import { createFixtureAction } from "../actions";
import { FixtureForm } from "../fixture-form";

export const metadata = { title: "New Fixture" };

export default async function NewFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; system?: string }>;
}) {
  await requireRole("member");
  const { scope } = await viewer();
  const [places, systems, kinds] = await Promise.all([
    listSpaces(db, scope).then((rows) => flattenTree(buildTree(rows))),
    listSystemChoices(db, scope),
    getFixtureKinds(db, scope),
  ]);
  const { space, system } = await searchParams;
  return (
    <>
      <PageHeader
        title="New Fixture"
        back={{
          href: space
            ? `/places/${space}`
            : system
              ? `/systems/${system}`
              : "/fixtures",
          label: "Back",
        }}
      />
      <FixtureForm
        action={createFixtureAction}
        places={places}
        systems={systems}
        kinds={kinds}
        initial={{
          spaceId: space,
          systemId: systems.some((s) => s.id === system) ? system : undefined,
        }}
        submit="Add Fixture"
      />
    </>
  );
}
