"use client";

import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { PlaceSelect } from "@/components/PlaceSelect";
import { focusUnlessTouch } from "@/components/ui/focus";

const KINDS = [
  { value: "room", label: "Room" },
  { value: "floor", label: "Floor or Building" },
  { value: "outdoor", label: "Outdoors" },
  { value: "area", label: "Closet, Nook or Crawlspace" },
  { value: "other", label: "Other" },
];

export function PlaceForm({
  action,
  places,
  initial,
  submit,
}: {
  action: FormAction;
  places: { id: string; label: string }[];
  initial?: {
    name?: string;
    parentId?: string | null;
    kind?: string;
    notes?: string;
    updatedAt?: string;
  };
  submit: string;
}) {
  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Name">
        <TextInput
          name="name"
          defaultValue={initial?.name}
          placeholder="Living room"
          required
          ref={initial?.name ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="Inside Another Place">
        <PlaceSelect
          name="parentId"
          defaultValue={initial?.parentId ?? ""}
          options={places}
          emptyLabel="No"
        />
      </Field>
      <Field label="Kind">
        <Select name="kind" defaultValue={initial?.kind ?? "room"}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <TextArea name="notes" defaultValue={initial?.notes} />
      </Field>
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
