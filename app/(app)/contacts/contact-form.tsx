"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { TradeChips } from "@/components/TradeChips";
import {
  Checkbox,
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { tradeLabeler, type TradeGroup } from "@/lib/contacts/trade-labels";
import { focusUnlessTouch } from "@/components/ui/focus";
import { OTHER_CHOICE } from "@/lib/core/choices";

type Method = { label: string; value: string };

/* What the label dropdown posts for "Other…"; the action saves it as no label. */
const OTHER = OTHER_CHOICE;
const PHONE_LABELS = ["Office", "Cell", "Home", "After Hours", "Emergency"];
const EMAIL_LABELS = ["Office", "Personal", "Billing", "Support"];

/*
 * What a number or address is for: a dropdown of the usual answers. One saved
 * in other words stays in the list as itself, and "Other…" swaps the dropdown
 * for a box to type one.
 */
function MethodLabel({
  name,
  choices,
  initial,
  label,
}: {
  name: string;
  choices: string[];
  initial: string;
  label: string;
}) {
  const [value, setValue] = useState(initial);
  const [typing, setTyping] = useState(false);
  if (typing)
    return (
      <TextInput
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Label"
        aria-label={label}
        ref={focusUnlessTouch}
      />
    );
  const options =
    initial && !choices.includes(initial) ? [...choices, initial] : choices;
  return (
    <Select
      name={name}
      value={value}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setValue("");
          setTyping(true);
        } else setValue(e.target.value);
      }}
    >
      <option value="">Label</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
      <option value={OTHER}>Other…</option>
    </Select>
  );
}

function Methods({
  prefix,
  label,
  type,
  choices,
  initial,
  placeholder,
}: {
  prefix: string;
  label: string;
  type: "tel" | "email";
  choices: string[];
  initial: Method[];
  placeholder: string;
}) {
  const rows = [
    ...initial,
    { label: "", value: "" },
    { label: "", value: "" },
  ].slice(0, Math.max(2, initial.length + 1));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink-2">{label}</legend>
      {rows.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_8.5rem] gap-2">
          <TextInput
            name={`${prefix}Value`}
            type={type}
            inputMode={type}
            defaultValue={m.value}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
          />
          <MethodLabel
            name={`${prefix}Label`}
            choices={choices}
            initial={m.label}
            label={`${label} ${i + 1} Label`}
          />
        </div>
      ))}
    </fieldset>
  );
}

export function ContactForm({
  action,
  groups,
  initial,
  submit,
}: {
  action: FormAction;
  groups: TradeGroup[];
  initial?: {
    name?: string;
    company?: string;
    phones?: Method[];
    emails?: Method[];
    website?: string;
    notes?: string;
    accountNumber?: string;
    inGuide?: boolean;
    trades?: { trade: string; preferred: boolean }[];
    updatedAt?: string;
  };
  submit: string;
}) {
  const initialTrades = initial?.trades ?? [];
  const [chosen, setChosen] = useState<string[]>(
    initialTrades.map((t) => t.trade),
  );
  const preferred = new Set(
    initialTrades.filter((t) => t.preferred).map((t) => t.trade),
  );
  const label = tradeLabeler(groups);

  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Name">
        <TextInput
          name="name"
          defaultValue={initial?.name}
          placeholder="Ace Plumbing"
          required
          ref={initial?.name ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field
        label="Contact Person or Company"
        hint="Who to ask for there, or where this person works"
      >
        <TextInput name="company" defaultValue={initial?.company} />
      </Field>
      <Methods
        prefix="phone"
        label="Phone"
        type="tel"
        choices={PHONE_LABELS}
        initial={initial?.phones ?? []}
        placeholder="(555) 123-4567"
      />
      <Methods
        prefix="email"
        label="Email"
        type="email"
        choices={EMAIL_LABELS}
        initial={initial?.emails ?? []}
        placeholder="name@example.com"
      />
      <Field label="Website">
        <TextInput
          name="website"
          type="url"
          inputMode="url"
          defaultValue={initial?.website}
          placeholder="https://"
        />
      </Field>

      <TradeChips
        legend="Trades"
        groups={groups}
        chosen={chosen}
        onChange={setChosen}
      />

      {chosen.length ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-2">
            Go-To For
          </legend>
          <p className="mb-1 text-xs text-ink-3">
            Who to call first; shown on Home and the house guide
          </p>
          {chosen.map((t) => (
            <Checkbox
              key={t}
              name="preferred"
              value={t}
              label={label(t)}
              defaultChecked={preferred.has(t)}
            />
          ))}
        </fieldset>
      ) : null}

      <Checkbox
        name="inGuide"
        label="Show on House Guide"
        defaultChecked={initial?.inGuide}
      />
      <Field label="Account Number" hint="Never shown on the house guide">
        <TextInput name="accountNumber" defaultValue={initial?.accountNumber} />
      </Field>
      <Field label="Notes">
        <TextArea name="notes" defaultValue={initial?.notes} />
      </Field>
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
