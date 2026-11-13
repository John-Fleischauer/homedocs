import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { viewer } from "@/lib/web/context";
import { createPlaceAction } from "../actions";
import { PlaceForm } from "../place-form";

export const metadata = { title: "New Place" };

export default async function NewPlacePage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  await requireRole("member");
  const { scope } = await viewer();
  const places = flattenTree(buildTree(await listSpaces(db, scope)));
  const { parent } = await searchParams;
  return (
    <>
      <PageHeader
        title="New Place"
        back={{ href: parent ? `/places/${parent}` : "/places", label: "Back" }}
      />
      <PlaceForm
        action={createPlaceAction}
        places={places}
        initial={{ parentId: parent }}
        submit="Add Place"
      />
    </>
  );
}
