"use client";

import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { focusUnlessTouch } from "@/components/ui/focus";
import { ContactField, PlaceChips } from "../project-form";

export function SeriesForm({
  action,
  places,
  contacts,
  initial,
  submit,
}: {
  action: FormAction;
  places: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
  initial?: {
    title?: string;
    howTo?: string;
    contactId?: string | null;
    spaceIds?: string[];
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
          name="title"
          defaultValue={initial?.title}
          placeholder="Spring mulching"
          required
          ref={initial?.title ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="Instructions" hint="Shown on every project in the series">
        <TextArea
          name="howTo"
          rows={5}
          defaultValue={initial?.howTo}
          placeholder="Rake out the old mulch first"
        />
      </Field>
      <ContactField contacts={contacts} defaultValue={initial?.contactId} />
      <PlaceChips places={places} chosen={initial?.spaceIds} />
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
