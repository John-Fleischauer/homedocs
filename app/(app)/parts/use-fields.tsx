"use client";

import { useState } from "react";
import { ChoiceInput } from "@/components/ui/Choice";
import { Field, TextInput } from "@/components/ui/Field";
import { tidyUnit, unitChoices } from "@/lib/parts/templates";
import { formatQty } from "@/lib/web/format";
import { UnitInput } from "./unit-input";

/* How a part is used by one fixture or place. Shown when adding a part from a page. */
export function UseFields({
  unit,
  units = [],
  finishes,
  ownerKind,
  initial,
}: {
  /** The part's usual unit, and everything it is sold by: the Unit list leads with these. */
  unit: string;
  units?: string[];
  finishes?: string[];
  ownerKind: "fixture" | "place";
  initial?: {
    surface?: string;
    finish?: string;
    quantity?: string | null;
    unit?: string;
    quantityNeeded?: string | null;
    notes?: string;
  };
}) {
  const own = [unit, ...units];
  const [useUnit, setUseUnit] = useState(() =>
    tidyUnit(initial?.unit ?? unit, own),
  );
  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-line bg-card p-4">
      <legend className="px-1 text-sm font-semibold text-ink-2">
        How It’s Used
      </legend>
      <div className="grid grid-cols-2 items-start gap-3">
        <Field label="Amount">
          <TextInput
            name="quantity"
            inputMode="decimal"
            defaultValue={formatQty(initial?.quantity)}
            placeholder="3"
          />
        </Field>
        <Field label="Unit">
          <UnitInput
            name="useUnit"
            label="Unit"
            choices={unitChoices(own)}
            value={useUnit}
            onChange={setUseUnit}
          />
        </Field>
      </div>
      {ownerKind === "place" ? (
        <Field label="Where Exactly">
          <TextInput
            name="surface"
            defaultValue={initial?.surface}
            placeholder="Walls"
          />
        </Field>
      ) : (
        <input type="hidden" name="surface" value={initial?.surface ?? ""} />
      )}
      {finishes?.length ? (
        <Field label="Finish">
          <ChoiceInput
            name="finish"
            label="Finish"
            choices={finishes}
            defaultValue={initial?.finish}
            placeholder="Eggshell"
          />
        </Field>
      ) : (
        <input type="hidden" name="finish" value={initial?.finish ?? ""} />
      )}
      <Field label="Actual Amount Needed" hint="If it took more or less">
        <TextInput
          name="quantityNeeded"
          inputMode="decimal"
          defaultValue={formatQty(initial?.quantityNeeded)}
        />
      </Field>
      <Field label="Notes">
        <TextInput name="useNotes" defaultValue={initial?.notes} />
      </Field>
    </fieldset>
  );
}
