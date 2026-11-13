/*
 * Light, dark or the device's: the one per-device preference.
 *
 * It lives in localStorage rather than the database (standards design.md, Dark
 * mode): it has to apply before first paint with no request, and a phone and a
 * desk can reasonably differ. "System" is no stored value and no `data-theme`,
 * so app/globals.css's media block decides; an explicit choice sets
 * `data-theme` on <html>, which the attribute blocks key on.
 *
 * Plain module, not 'use client': the root layout (a server component) inlines
 * `themeInitScript`, and a value imported from a client module would arrive
 * there as a reference rather than a string.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "theme";

/** Fired on window after a change in this tab, for the Settings control; the
 *  head script's `storage` listener covers other tabs. */
export const THEME_EVENT = "homedocs-theme";

/** `--color-page` in each theme, for the browser bar and the manifest.
 *  test/design/contrast.test.ts checks them against app/globals.css. */
export const PAGE_COLOR = { light: "#f6f5f2", dark: "#141412" } as const;

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Apply a stored value to the open document: `data-theme` for an explicit
 * choice, none for the device's, and a `theme-color` meta of its own, first in
 * <head> so the browser bar follows the choice. Next's two media-query metas
 * are left untouched, so hydration sees exactly what the server rendered.
 *
 * Self-contained, no closures or imports, because its source is also inlined
 * as the head script (`themeInitScript`): one implementation, not two.
 */
export function applyTheme(
  stored: string | null,
  light: string,
  dark: string,
): void {
  const root = document.documentElement;
  let meta = document.getElementById("theme-choice");
  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
    if (!meta) {
      meta = document.createElement("meta");
      meta.id = "theme-choice";
      meta.setAttribute("name", "theme-color");
    }
    meta.setAttribute("content", stored === "dark" ? dark : light);
    /* First, every time: a browser takes the first theme-color that matches,
       and hydration can put Next's metas ahead of it (ThemeSync re-runs this). */
    document.head.prepend(meta);
  } else {
    root.removeAttribute("data-theme");
    if (meta) meta.remove();
  }
}

/**
 * Inline in <head>, before first paint, so an explicit choice never flashes
 * the device's theme. It also listens for `storage`, so every open tab follows
 * a choice made in another. homedocs sends no Content-Security-Policy, so an
 * inline script needs no hash (standards design.md, Dark mode).
 */
export const themeInitScript = `(function(){var a=${applyTheme.toString()};var l='${PAGE_COLOR.light}',d='${PAGE_COLOR.dark}';try{a(localStorage.getItem('${THEME_KEY}'),l,d)}catch(e){}window.addEventListener('storage',function(e){if(e.key==='${THEME_KEY}')a(e.newValue,l,d)})})();`;
