"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { TradeChips } from "@/components/TradeChips";
import { Icon } from "@/components/ui/icons";
import type { TradeGroup } from "@/lib/contacts/trade-labels";
import {
  Field,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { SYSTEM_ICONS, type SystemIcon } from "@/lib/systems/seeds";
import { focusUnlessTouch } from "@/components/ui/focus";

const ICON_LABEL: Record<SystemIcon, string> = {
  water: "Water",
  bolt: "Electric",
  climate: "Heating & Cooling",
  flame: "Gas / fire",
  drain: "Drain",
  leaf: "Yard",
  shield: "Safety",
  wifi: "Network",
  system: "Other",
};

export function SystemForm({
  action,
  groups,
  initial,
  submit,
}: {
  action: FormAction;
  /** The family's list of what contacts do, so "who to call" can be ticked rather than typed. */
  groups: TradeGroup[];
  initial?: {
    name?: string;
    icon?: string;
    trades?: string[];
    notes?: string;
    updatedAt?: string;
  };
  submit: string;
}) {
  const [icon, setIcon] = useState(initial?.icon ?? "system");
  const [chosen, setChosen] = useState<string[]>(initial?.trades ?? []);
  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Name">
        <TextInput
          name="name"
          defaultValue={initial?.name}
          placeholder="Pool, Solar, Water softener"
          required
          ref={initial?.name ? undefined : focusUnlessTouch}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-2">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {SYSTEM_ICONS.map((i) => (
            <label
              key={i}
              className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border ${
                icon === i
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-ink-2"
              }`}
            >
              <input
                type="radio"
                name="icon"
                value={i}
                checked={icon === i}
                onChange={() => setIcon(i)}
                className="sr-only"
                aria-label={ICON_LABEL[i]}
              />
              <Icon name={i} />
            </label>
          ))}
        </div>
      </fieldset>

      <TradeChips
        legend="Who to Call"
        groups={groups}
        chosen={chosen}
        onChange={setChosen}
      />

      <Field label="Notes">
        <TextArea name="notes" defaultValue={initial?.notes} />
      </Field>
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
