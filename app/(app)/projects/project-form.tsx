"use client";

import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { focusUnlessTouch } from "@/components/ui/focus";

const STATUSES = [
  ["idea", "Idea"],
  ["planning", "Planning"],
  ["quoted", "Getting Quotes"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In Progress"],
  ["done", "Done"],
  ["dropped", "Dropped"],
] as const;

export function ProjectForm({
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
    status?: string;
    priority?: string;
    targetDate?: string | null;
    summary?: string;
    spaceIds?: string[];
    contactId?: string | null;
    seriesId?: string;
    updatedAt?: string;
  };
  submit: string;
}) {
  const chosen = new Set(initial?.spaceIds ?? []);
  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      {initial?.seriesId ? (
        <input type="hidden" name="seriesId" value={initial.seriesId} />
      ) : null}
      <Field label="Title">
        <TextInput
          name="title"
          defaultValue={initial?.title}
          placeholder="Replace electrical panel"
          required
          ref={initial?.title ? undefined : focusUnlessTouch}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select name="status" defaultValue={initial?.status ?? "idea"}>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue={initial?.priority ?? "normal"}>
            <option value="high">Soon</option>
            <option value="normal">Normal</option>
            <option value="low">Someday</option>
          </Select>
        </Field>
      </div>
      <Field label="Target Date">
        <TextInput
          name="targetDate"
          type="date"
          defaultValue={initial?.targetDate ?? ""}
        />
      </Field>
      <Field
        label="Details"
        hint={
          initial?.seriesId
            ? "For this project only; series instructions show anyway"
            : undefined
        }
      >
        <TextArea name="summary" rows={4} defaultValue={initial?.summary} />
      </Field>
      {contacts.length ? (
        <Field label="Who’s Doing It">
          <Select name="contactId" defaultValue={initial?.contactId ?? ""}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {places.length ? (
        <Field label="Places" hint="Ctrl/⌘-click for more than one">
          <select
            name="spaceIds"
            multiple
            defaultValue={[...chosen]}
            className="min-h-32 w-full rounded-control border border-line bg-card px-2 py-2 text-[15px] text-ink"
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
