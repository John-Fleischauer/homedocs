"use client";

import { useState } from "react";
import {
  choiceLabel,
  choiceValue,
  matchChoice,
  OTHER_CHOICE as OTHER,
  yesNoValue,
  type Choice,
} from "@/lib/core/choices";
import { Select, TextInput } from "./Field";

/*
 * A dropdown of the usual answers, with "Other…" for the rest. The form posts
 * `name` from the dropdown, or from the text box once "Other…" is picked. An
 * answer saved before the field had a list, or one the list doesn't have,
 * opens on "Other…" with its text, so saving again never loses it.
 */
export function ChoiceInput({
  name,
  label,
  choices,
  defaultValue = "",
  placeholder,
}: {
  name: string;
  /** For the text box's own label; the dropdown takes the Field's. */
  label: string;
  choices: Choice[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const listed = matchChoice(choices, defaultValue);
  const [other, setOther] = useState(!listed && defaultValue !== "");
  const [value, setValue] = useState(listed ?? defaultValue);
  // Only a box opened by picking "Other…" takes focus, not one the page opens with.
  const [picked, setPicked] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Select
        name={other ? undefined : name}
        // Named outright: inside the Field's <label>, its name would also read out the picked answer.
        aria-label={label}
        value={other ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            setPicked(true);
            setValue("");
            return;
          }
          setOther(false);
          setValue(e.target.value);
        }}
      >
        <option value="">—</option>
        {choices.map((c) => (
          <option key={choiceValue(c)} value={choiceValue(c)}>
            {choiceLabel(c)}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </Select>
      {other ? (
        <TextInput
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={`${label}, other`}
          autoFocus={picked}
        />
      ) : null}
    </div>
  );
}

/*
 * Yes, No or Not sure, as one row of buttons (radios underneath). Not sure
 * saves nothing. An answer saved before, that isn't a plain yes or no, gets a
 * button of its own so saving again keeps it.
 */
export function YesNoInput({
  name,
  label,
  defaultValue = "",
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  // "Yes", "No", "" (not sure), or undefined for an answer saved in other words.
  const plain = yesNoValue(defaultValue);
  const options: [value: string, text: string][] = [
    ["Yes", "Yes"],
    ["No", "No"],
    ["", "Not sure"],
  ];
  if (plain === undefined) options.push([defaultValue, defaultValue]);
  const checked = plain ?? defaultValue;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, text], i) => (
          <label key={i} className="min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              value={value}
              defaultChecked={value === checked}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center justify-center rounded-control border border-line bg-card px-3 text-center text-[15px] text-ink peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-medium peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
              {text}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
