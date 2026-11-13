"use client";

import { useSyncExternalStore } from "react";
import {
  applyTheme,
  PAGE_COLOR,
  readTheme,
  THEME_EVENT,
  THEME_KEY,
  type Theme,
} from "@/lib/design/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/* A choice storage refused (a private window) still holds for this page. */
let unsaved: Theme | null = null;

function subscribe(onChange: () => void) {
  const fromStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    unsaved = null;
    onChange();
  };
  window.addEventListener("storage", fromStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", fromStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function current(): Theme {
  return unsaved ?? readTheme();
}

function choose(next: Theme) {
  unsaved = null;
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    unsaved = next;
  }
  applyTheme(next, PAGE_COLOR.light, PAGE_COLOR.dark);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Light, dark or the device's, as three buttons in one bordered row. The server
 * renders "System" pressed; the stored choice takes over on hydration
 * (useSyncExternalStore), and the head script has already painted it.
 */
export function ThemeChoice() {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "system");
  return (
    <div className="flex flex-col gap-1.5">
      <span id="theme-label" className="text-sm font-medium text-ink-2">
        Theme
      </span>
      <div
        role="group"
        aria-labelledby="theme-label"
        className="flex w-fit overflow-hidden rounded-control border border-line"
      >
        {OPTIONS.map((option) => {
          const on = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => choose(option.value)}
              className={`flex min-h-11 items-center px-4 text-[15px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                on ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-sunk"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
