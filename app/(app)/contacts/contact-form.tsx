"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { TradeChips } from "@/components/TradeChips";
import {
  Checkbox,
  Field,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { tradeLabeler, type TradeGroup } from "@/lib/contacts/trade-labels";
import { focusUnlessTouch } from "@/components/ui/focus";

type Method = { label: string; value: string };

function Methods({
  prefix,
  label,
  type,
  initial,
  placeholder,
}: {
  prefix: string;
  label: string;
  type: string;
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
        <div key={i} className="grid grid-cols-[7rem_1fr] gap-2">
          <TextInput
            name={`${prefix}Label`}
            defaultValue={m.label}
            placeholder={i === 0 ? "Office" : "Cell"}
            aria-label={`${label} ${i + 1} label`}
          />
          <TextInput
            name={`${prefix}Value`}
            type={type}
            defaultValue={m.value}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
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
          placeholder="Ace Plumbing, City Water"
          required
          ref={initial?.name ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="Company or Contact Person">
        <TextInput name="company" defaultValue={initial?.company} />
      </Field>
      <Methods
        prefix="phone"
        label="Phone"
        type="tel"
        initial={initial?.phones ?? []}
        placeholder="(555) 123-4567"
      />
      <Methods
        prefix="email"
        label="Email"
        type="email"
        initial={initial?.emails ?? []}
        placeholder="name@example.com"
      />
      <Field label="Website">
        <TextInput
          name="website"
          type="url"
          inputMode="url"
          defaultValue={initial?.website}
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
            Shown on Home and the house guide
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
