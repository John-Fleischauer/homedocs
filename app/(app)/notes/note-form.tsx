"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { PlaceSelect } from "@/components/PlaceSelect";
import { buttonClass } from "@/components/ui/Button";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { localDay } from "@/lib/web/format";
import { focusUnlessTouch } from "@/components/ui/focus";

type Opt = { id: string; label: string };

export type NoteFormOptions = {
  places: Opt[];
  fixtures: Opt[];
  parts: Opt[];
  contacts: Opt[];
  projects: Opt[];
};

export function NoteForm({
  action,
  options,
  initial,
  submit,
}: {
  action: FormAction;
  options: NoteFormOptions;
  initial?: Partial<
    Record<
      | "title"
      | "happenedOn"
      | "body"
      | "spaceId"
      | "fixtureId"
      | "supplyId"
      | "contactId"
      | "projectId"
      | "quantity"
      | "unit"
      | "cost"
      | "nextTime"
      | "remindAfter"
      | "updatedAt",
      string | null
    >
  >;
  submit: string;
}) {
  const v = (k: keyof NonNullable<typeof initial>) => initial?.[k] ?? "";
  const [more, setMore] = useState(
    Boolean(
      initial?.cost ||
      initial?.contactId ||
      initial?.projectId ||
      initial?.body,
    ),
  );
  const today = localDay();

  const pick = (name: string, label: string, opts: Opt[], value: string) =>
    opts.length ? (
      <Field label={label}>
        <Select name={name} defaultValue={value}>
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    ) : (
      <input type="hidden" name={name} value={value} />
    );

  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Title">
        <TextInput
          name="title"
          defaultValue={v("title")}
          placeholder="Put down mulch, Replaced furnace filter"
          required
          ref={initial?.title ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="When">
        <TextInput
          name="happenedOn"
          type="date"
          defaultValue={v("happenedOn") || today}
        />
      </Field>
      <Field label="Place">
        <PlaceSelect
          name="spaceId"
          defaultValue={v("spaceId")}
          options={options.places}
          emptyLabel="—"
        />
      </Field>
      {pick("fixtureId", "Fixture", options.fixtures, v("fixtureId"))}
      {pick("supplyId", "Part", options.parts, v("supplyId"))}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <TextInput
            name="quantity"
            inputMode="decimal"
            defaultValue={v("quantity")}
            placeholder="12"
          />
        </Field>
        <Field label="Unit">
          <TextInput name="unit" defaultValue={v("unit")} placeholder="bags" />
        </Field>
      </div>
      <Field label="Next Time" hint="E.g. “needed 3 more”">
        <TextArea name="nextTime" rows={2} defaultValue={v("nextTime")} />
      </Field>
      <Field label="Remind Around" hint="Shows on Home near this date">
        <TextInput
          name="remindAfter"
          type="date"
          defaultValue={v("remindAfter")}
        />
      </Field>
      {more ? (
        <>
          <Field label="Cost">
            <TextInput
              name="cost"
              inputMode="decimal"
              defaultValue={v("cost")}
              placeholder="$"
            />
          </Field>
          {pick("contactId", "Who Did It", options.contacts, v("contactId"))}
          {pick("projectId", "Project", options.projects, v("projectId"))}
          <Field label="Details">
            <TextArea name="body" rows={4} defaultValue={v("body")} />
          </Field>
        </>
      ) : (
        <>
          <input type="hidden" name="cost" value={v("cost")} />
          <input type="hidden" name="contactId" value={v("contactId")} />
          <input type="hidden" name="projectId" value={v("projectId")} />
          <input type="hidden" name="body" value={v("body")} />
          <button
            type="button"
            className={buttonClass("ghost", "self-start")}
            onClick={() => setMore(true)}
          >
            + Cost, who did it, details
          </button>
        </>
      )}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
