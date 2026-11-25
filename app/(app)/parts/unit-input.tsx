"use client";

import { useState } from "react";
import { matchChoice, OTHER_CHOICE } from "@/lib/core/choices";
import { Select, TextInput } from "@/components/ui/Field";
import { focusUnlessTouch } from "@/components/ui/focus";

/*
 * A unit, picked: the part's own units first, then the usual ones, with
 * "Other…" for one the list doesn't have. Controlled, so a form can change the
 * list (and the unit) when a different part is chosen. A unit saved before
 * there was a list, or one the list lacks, opens on "Other…" with its text.
 */
export function UnitInput({
  name,
  label,
  choices,
  value,
  onChange,
}: {
  name: string;
  /** For the controls' own names; the dropdown is usually inside a Field. */
  label: string;
  choices: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const listed = matchChoice(choices, value);
  // "Other…" was picked and nothing typed yet: the box stays open while it's blank.
  const [typing, setTyping] = useState(false);
  const other = typing || (value !== "" && !listed);
  return (
    <div className="flex flex-col gap-2">
      <Select
        name={other ? undefined : name}
        // Named outright: inside the Field's <label>, its name would also read out the picked unit.
        aria-label={label}
        value={other ? OTHER_CHOICE : (listed ?? "")}
        onChange={(e) => {
          const picked = e.target.value;
          setTyping(picked === OTHER_CHOICE);
          onChange(picked === OTHER_CHOICE ? "" : picked);
        }}
      >
        <option value="">None</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OTHER_CHOICE}>Other…</option>
      </Select>
      {other ? (
        <TextInput
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Unit"
          aria-label={`${label}, other`}
          ref={typing ? focusUnlessTouch : undefined}
        />
      ) : null}
    </div>
  );
}
