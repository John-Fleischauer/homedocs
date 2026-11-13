/**
 * A ref that focuses its field as it mounts, except on a touch screen: there
 * focus opens the keyboard over the page before anyone asked to type
 * (standards `design.md`, no `autoFocus` on a phone). `coarse`, as in
 * app/globals.css's touch floor, so a keyboard-only device (`pointer: none`)
 * keeps its focus. Use it in place of `autoFocus`. A module function, so React
 * calls it once per mount rather than on every render.
 */
export function focusUnlessTouch(element: HTMLElement | null) {
  if (element && !window.matchMedia("(pointer: coarse)").matches)
    element.focus();
}
