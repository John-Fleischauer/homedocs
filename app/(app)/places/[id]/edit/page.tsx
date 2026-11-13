import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  buildTree,
  flattenTree,
  getSpace,
  listSpaces,
} from "@/lib/places/places";
import { viewer } from "@/lib/web/context";
import { deletePlaceAction, updatePlaceAction } from "../../actions";
import { PlaceForm } from "../../place-form";

export const metadata = { title: "Edit Place" };

export default async function EditPlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("member");
  const { id } = await params;
  const { scope } = await viewer();
  const place = await getSpace(db, scope, id);
  const places = flattenTree(buildTree(await listSpaces(db, scope))).filter(
    (p) => p.id !== id,
  );
  return (
    <>
      <PageHeader
        title={`Edit ${place.name}`}
        back={{ href: `/places/${id}`, label: place.name }}
      />
      <PlaceForm
        action={updatePlaceAction.bind(null, id)}
        places={places}
        initial={{ ...place, updatedAt: place.updatedAt.toISOString() }}
        submit="Save"
      />
      <div className="mt-8 border-t border-line pt-6">
        <DeleteButton
          action={deletePlaceAction.bind(null, id)}
          what={`“${place.name}”`}
        />
      </div>
    </>
  );
}
