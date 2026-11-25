import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getFixtureKinds } from "@/lib/fixtures/kinds";
import { viewer } from "@/lib/web/context";
import { saveFixtureKindsAction } from "../actions";
import { KindListForm } from "./kind-list-form";

export const metadata = { title: "Fixture Kinds" };

export default async function FixtureKindsPage() {
  await requireRole("member");
  const { scope } = await viewer();
  return (
    <>
      <PageHeader
        title="Fixture Kinds"
        subtitle="Fixtures keep a kind removed here"
        back={{ href: "/fixtures", label: "Fixtures" }}
      />
      <KindListForm
        action={saveFixtureKindsAction}
        initial={await getFixtureKinds(db, scope)}
      />
    </>
  );
}
