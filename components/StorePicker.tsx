"use client";

import { useId, useState, type ComponentProps } from "react";
import { knownRetailer, searchRetailers } from "@/lib/parts/retailers";
import { TextInput } from "./ui/Field";
import { StoreBadge } from "./StoreBadge";

/*
 * A store's name: type anything, or pick a known retailer from the list that
 * opens under the box, filtered as you type ("low" → Lowe's, "wal-m" →
 * Walmart). The ARIA combobox pattern: arrows move through the list, Enter
 * picks, Escape closes; a tap picks too. The box posts what it shows.
 */
export function StorePicker({
  value,
  onChange,
  ...input
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<
  ComponentProps<"input">,
  // Its own: the list needs them, and a caller's would be silently dropped.
  "value" | "onChange" | "onFocus" | "onBlur" | "onKeyDown" | "role"
>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = searchRetailers(value);
  // Nothing to offer once the box already names the one match ("lowes", "Lowe's").
  const shown =
    matches.length === 1 &&
    knownRetailer({ retailer: value, url: "" }) === matches[0]
      ? []
      : matches;
  const expanded = open && shown.length > 0;

  // Closing forgets the highlight, so a later Enter saves the form rather than picking.
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (name: string) => {
    onChange(name);
    close();
  };

  return (
    <div className="relative min-w-0 flex-1">
      <TextInput
        {...input}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-${active}` : undefined
        }
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!expanded) return setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((a) => (a + step + shown.length) % shown.length);
          } else if (
            e.key === "Enter" &&
            expanded &&
            active >= 0 &&
            // Enter that finishes a word on a CJK keyboard isn't a pick.
            !e.nativeEvent.isComposing
          ) {
            // Picks; doesn't submit the form.
            e.preventDefault();
            pick(shown[active]!.name);
          } else if (e.key === "Escape" && expanded) {
            e.preventDefault();
            close();
          }
        }}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Known stores"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-control border border-line bg-card py-1 shadow-lg"
      >
        {/* Only built while open: ten blank rows needn't each draw every badge. */}
        {(expanded ? shown : []).map((r, i) => (
          <li
            key={r.key}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            // Keeps the box focused, so its blur doesn't close the list before the pick lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(r.name)}
            className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-[15px] text-ink hover:bg-sunk ${
              i === active ? "bg-sunk" : ""
            }`}
          >
            <StoreBadge
              store={{ retailer: r.name, url: "" }}
              className="h-7 w-7"
            />
            {r.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
