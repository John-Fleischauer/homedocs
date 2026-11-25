"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { DeleteButton } from "@/components/DeleteButton";
import { buttonClass } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Card";
import {
  Checkbox,
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import type { ActionResult } from "@/lib/web/action";
import { InlineError, useRun } from "@/components/useRun";
import { useSeriesConfirm } from "@/components/SeriesConfirm";
import { MoreOptions } from "../project-form";
import type { ItemView, MissingView } from "../series-view";

const STATUSES = [
  ["idea", "Idea"],
  ["planning", "Planning"],
  ["quoted", "Getting Quotes"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In Progress"],
  ["done", "Done"],
  ["dropped", "Dropped"],
] as const;

/* The steps a job goes through, in order. Dropped is off the line. */
const FLOW = STATUSES.slice(0, 6).map(([s]) => s as string);

/* The usual next step from each status, as the one-tap button. */
const NEXT: Record<string, [to: string, verb: string]> = {
  idea: ["planning", "Start Planning"],
  planning: ["quoted", "Get Quotes"],
  quoted: ["scheduled", "Mark Scheduled"],
  scheduled: ["in_progress", "Start Work"],
  in_progress: ["done", "Mark Done"],
};

/*
 * The status as a labelled dropdown (any step, or Dropped), the usual next
 * step as one button beside it, and how far along the job is as a bar.
 */
export function StatusStepper({
  status,
  setStatus,
  canEdit,
}: {
  status: string;
  setStatus: (s: string) => Promise<ActionResult>;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(status);
  const [error, setError] = useState<string | null>(null);
  const move = (to: string) =>
    start(async () => {
      setShown(to);
      setError(null);
      const result = await setStatus(to);
      if (result?.error) setError(result.error);
    });
  const index = FLOW.indexOf(shown);
  const next = NEXT[shown];
  return (
    <div className="flex flex-col gap-2">
      {canEdit ? (
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="px-1 text-sm font-medium text-ink-2">Status</span>
            <Select
              value={shown}
              disabled={pending}
              onChange={(e) => move(e.target.value)}
            >
              {STATUSES.map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          {next ? (
            <button
              type="button"
              disabled={pending}
              className={buttonClass("primary", "shrink-0")}
              onClick={() => move(next[0])}
            >
              {next[1]}
            </button>
          ) : null}
        </div>
      ) : null}
      {index >= 0 ? (
        <div aria-hidden="true" className="grid grid-cols-6 gap-1">
          {FLOW.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 rounded-full ${i <= index ? "bg-accent" : "bg-line"}`}
            />
          ))}
        </div>
      ) : null}
      <InlineError>{error}</InlineError>
    </div>
  );
}

export function Checklist({
  items,
  missing = [],
  toggle,
  remove,
  add,
  places,
  quotes,
  canEdit,
  inSeries = false,
  setOneOff,
  sendToSeries,
  copyHere,
  dropFromSeries,
}: {
  items: ItemView[];
  /** Series to-dos this project doesn't have. */
  missing?: MissingView[];
  /** Absent on a series' default checklist, which has nothing to tick. */
  toggle?: (id: string, done: boolean) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  add: FormAction;
  places: { id: string; label: string }[];
  quotes: { id: string; label: string }[];
  canEdit: boolean;
  /** A project in a series: offer "Only this project" when adding. */
  inSeries?: boolean;
  setOneOff?: (id: string, oneOff: boolean) => Promise<ActionResult>;
  sendToSeries?: (id: string) => Promise<ActionResult>;
  copyHere?: (seriesRowId: string) => Promise<ActionResult>;
  dropFromSeries?: (seriesRowId: string) => Promise<ActionResult>;
}) {
  const { pending, run, error, at } = useRun();
  const [ask, dialog] = useSeriesConfirm();
  const link =
    "inline-flex min-h-11 items-center text-sm font-medium text-accent";
  return (
    <div className="flex flex-col gap-3">
      {items.length || missing.length ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {items.map((item) => {
            const differs =
              item.status === "changed" || item.status === "added";
            return (
              <li
                key={item.id}
                className={`flex flex-col px-4 py-2 ${differs ? "border-l-4 border-l-warn bg-warn-soft" : ""}`}
              >
                <div className="flex min-h-12 items-center gap-3">
                  {toggle ? (
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!canEdit}
                      aria-label={item.text}
                      onChange={(e) => {
                        const done = e.target.checked;
                        run(() => toggle(item.id, done), item.id);
                      }}
                      className="h-6 w-6 shrink-0 accent-[var(--color-accent)]"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block wrap-anywhere text-[15px] ${item.done ? "text-ink-3 line-through" : "text-ink"}`}
                    >
                      {item.text}
                    </span>
                    {item.spaceName || item.quoteLabel ? (
                      <span className="block text-xs text-ink-3">
                        {[
                          item.spaceName,
                          item.quoteLabel
                            ? `in ${item.quoteLabel}’s quote`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {differs || item.oneOff ? (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {item.status === "changed" ? (
                          <Pill tone="warn">Changed</Pill>
                        ) : null}
                        {item.status === "added" ? (
                          <Pill tone="warn">Not in Series</Pill>
                        ) : null}
                        {item.oneOff ? <Pill>This Project Only</Pill> : null}
                      </span>
                    ) : null}
                  </span>
                  {canEdit ? (
                    <DeleteButton
                      compact
                      className="h-11 w-11"
                      what={`“${item.text}”`}
                      label="Remove"
                      action={() => remove(item.id)}
                    />
                  ) : null}
                </div>
                {canEdit && (differs || item.oneOff) ? (
                  <div className="flex flex-wrap gap-x-4 pl-9">
                    {differs && sendToSeries ? (
                      <button
                        type="button"
                        disabled={pending}
                        className={link}
                        onClick={() =>
                          ask([item.change!], () =>
                            run(() => sendToSeries(item.id), item.id),
                          )
                        }
                      >
                        Update Series
                      </button>
                    ) : null}
                    {item.status === "added" && setOneOff ? (
                      <button
                        type="button"
                        disabled={pending}
                        className={link}
                        onClick={() =>
                          run(() => setOneOff(item.id, true), item.id)
                        }
                      >
                        Only This Project
                      </button>
                    ) : null}
                    {item.oneOff && setOneOff ? (
                      <button
                        type="button"
                        disabled={pending}
                        className={link}
                        onClick={() =>
                          run(() => setOneOff(item.id, false), item.id)
                        }
                      >
                        Not Just This Project
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <InlineError className="pb-1">
                  {at === item.id ? error : null}
                </InlineError>
              </li>
            );
          })}
          {missing.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-1 border-l-4 border-l-warn bg-warn-soft px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1 wrap-anywhere text-[15px] text-ink-2 line-through decoration-ink-3">
                  {m.label}
                </span>
                <Pill tone="warn">In Series, Not Here</Pill>
              </div>
              {canEdit && copyHere && dropFromSeries ? (
                <div className="flex flex-wrap gap-x-4">
                  <button
                    type="button"
                    disabled={pending}
                    className={link}
                    onClick={() => run(() => copyHere(m.id), m.id)}
                  >
                    Add Here
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={link}
                    onClick={() =>
                      ask([m.change], () =>
                        run(() => dropFromSeries(m.id), m.id),
                      )
                    }
                  >
                    Remove from Series
                  </button>
                </div>
              ) : null}
              <InlineError>{at === m.id ? error : null}</InlineError>
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <ActionForm action={add} resetOnSuccess className="flex flex-col gap-2">
          <div className="flex gap-2">
            <TextInput
              name="text"
              placeholder="Add a to-do"
              aria-label="New To-Do"
              required
            />
            <SubmitButton variant="secondary" pendingText="…">
              Add
            </SubmitButton>
          </div>
          {inSeries ? (
            <Checkbox name="oneOff" label="Only This Project" />
          ) : null}
          <MoreOptions>
            <div
              className={`grid gap-2 ${quotes.length ? "grid-cols-2" : "grid-cols-1"}`}
            >
              <Select name="spaceId" aria-label="Place" defaultValue="">
                <option value="">Choose Place</option>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
              {quotes.length ? (
                <Select
                  name="quoteId"
                  aria-label="Covered by Quote"
                  defaultValue=""
                >
                  <option value="">Which Quote?</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </MoreOptions>
        </ActionForm>
      ) : null}
      <InlineError>{at ? null : error}</InlineError>
      {dialog}
    </div>
  );
}

export function QuoteForm({
  add,
  contacts,
}: {
  add: FormAction;
  contacts: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        className={buttonClass("secondary")}
        onClick={() => setOpen(true)}
      >
        Add Quote
      </button>
    );
  }
  return (
    <ActionForm action={add} resetOnSuccess onSuccess={() => setOpen(false)}>
      <Field
        label="From"
        hint={contacts.length ? undefined : "Add the contact first"}
      >
        <Select name="contactId" defaultValue="">
          <option value="">Choose Contact</option>
          {contacts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <TextInput name="amount" inputMode="decimal" placeholder="$" />
        </Field>
        <Field label="Date">
          <TextInput name="receivedOn" type="date" />
        </Field>
      </div>
      <Field label="What’s Included">
        <TextArea name="notes" />
      </Field>
      <div className="flex gap-2">
        <SubmitButton variant="secondary">Add Quote</SubmitButton>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

export function QuoteButtons({
  status,
  setStatus,
  remove,
}: {
  status: string;
  setStatus: (s: "pending" | "accepted" | "declined") => Promise<unknown>;
  remove: () => Promise<unknown>;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "accepted" ? (
        <button
          type="button"
          disabled={pending}
          className={buttonClass("secondary")}
          onClick={() => start(async () => void (await setStatus("accepted")))}
        >
          Accept
        </button>
      ) : null}
      {status === "pending" ? (
        <button
          type="button"
          disabled={pending}
          className={buttonClass("secondary")}
          onClick={() => start(async () => void (await setStatus("declined")))}
        >
          Decline
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          className={buttonClass("ghost")}
          onClick={() => start(async () => void (await setStatus("pending")))}
        >
          Undo
        </button>
      )}
      <DeleteButton
        compact
        className="ml-auto h-11 w-11"
        what="this quote"
        recoverable={false}
        label="Remove"
        action={remove}
      />
    </div>
  );
}
