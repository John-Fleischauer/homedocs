"use client";

import { Field, TextInput } from "@/components/ui/Field";

/* How a part is used by one fixture or place. Shown when adding a part from a page. */
export function UseFields({
  unit,
  finishes,
  ownerKind,
  initial,
}: {
  unit: string;
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
  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-line bg-card p-4">
      <legend className="px-1 text-sm font-semibold text-ink-2">
        How it’s used {ownerKind === "fixture" ? "by this fixture" : "here"}
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <TextInput
            name="quantity"
            inputMode="decimal"
            defaultValue={initial?.quantity ?? ""}
            placeholder="3"
          />
        </Field>
        <Field label="Unit">
          <TextInput
            name="useUnit"
            defaultValue={initial?.unit ?? unit}
            placeholder="bulb, gal, bag"
          />
        </Field>
      </div>
      {ownerKind === "place" ? (
        <Field label="Where Exactly">
          <TextInput
            name="surface"
            defaultValue={initial?.surface}
            placeholder="Walls, trim, north bed"
          />
        </Field>
      ) : (
        <input type="hidden" name="surface" value={initial?.surface ?? ""} />
      )}
      {finishes?.length ? (
        <Field label="Finish">
          <TextInput
            name="finish"
            list="finishes"
            defaultValue={initial?.finish}
            placeholder="Eggshell"
          />
          <datalist id="finishes">
            {finishes.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
      ) : (
        <input type="hidden" name="finish" value={initial?.finish ?? ""} />
      )}
      <Field label="Actual Amount Needed" hint="If it took more or less">
        <TextInput
          name="quantityNeeded"
          inputMode="decimal"
          defaultValue={initial?.quantityNeeded ?? ""}
        />
      </Field>
      <Field label="Note">
        <TextInput name="useNotes" defaultValue={initial?.notes} />
      </Field>
    </fieldset>
  );
}
