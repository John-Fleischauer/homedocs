"use client";

import type { ReactNode } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { focusUnlessTouch } from "@/components/ui/focus";
import { Icon } from "@/components/ui/icons";

const STATUSES = [
  ["idea", "Idea"],
  ["planning", "Planning"],
  ["quoted", "Getting Quotes"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In Progress"],
  ["done", "Done"],
  ["dropped", "Dropped"],
] as const;

/*
 * The rarer fields of a form, behind one tap. A native <details>: what's
 * inside is still posted while it is closed, so a value filled in before
 * (a series' places) is never lost by not opening it.
 */
export function MoreOptions({
  open = false,
  children,
}: {
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevron"
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
        />
        More Options
      </summary>
      <div className="mt-2 flex flex-col gap-4">{children}</div>
    </details>
  );
}

/* Places as chips to tick, any number of them. Posts `spaceIds`. */
export function PlaceChips({
  places,
  chosen = [],
}: {
  places: { id: string; label: string }[];
  chosen?: string[];
}) {
  if (places.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-2">Places</legend>
      <div className="flex flex-wrap gap-2">
        {places.map((p) => (
          <label key={p.id} className="min-w-0">
            <input
              type="checkbox"
              name="spaceIds"
              value={p.id}
              defaultChecked={chosen.includes(p.id)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-card px-3 py-1.5 wrap-anywhere text-sm text-ink-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {p.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* Who the job is given to; the same field on a project and a series. */
export function ContactField({
  contacts,
  defaultValue,
}: {
  contacts: { id: string; label: string }[];
  defaultValue?: string | null;
}) {
  if (contacts.length === 0) return null;
  return (
    <Field label="Who’s Doing It">
      <Select name="contactId" defaultValue={defaultValue ?? ""}>
        <option value="">No one yet</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

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
  /* A new project is a title and a tap; one being edited, or started with
     something already filled in, shows the lot. */
  const filled = Boolean(
    initial?.updatedAt ||
    initial?.contactId ||
    initial?.spaceIds?.length ||
    initial?.targetDate ||
    (initial?.priority && initial.priority !== "normal"),
  );
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
      <Field label="Status">
        <Select name="status" defaultValue={initial?.status ?? "idea"}>
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Details"
        hint={
          initial?.seriesId
            ? "This project only; series instructions still show"
            : undefined
        }
      >
        <TextArea name="summary" rows={4} defaultValue={initial?.summary} />
      </Field>
      <MoreOptions open={filled}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select
              name="priority"
              defaultValue={initial?.priority ?? "normal"}
            >
              <option value="high">Soon</option>
              <option value="normal">Normal</option>
              <option value="low">Someday</option>
            </Select>
          </Field>
          <Field label="Target Date">
            <TextInput
              name="targetDate"
              type="date"
              defaultValue={initial?.targetDate ?? ""}
            />
          </Field>
        </div>
        <ContactField contacts={contacts} defaultValue={initial?.contactId} />
        <PlaceChips places={places} chosen={initial?.spaceIds} />
      </MoreOptions>
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
