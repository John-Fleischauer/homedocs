"use client";

import { buttonClass } from "../ui/Button";
import { Icon } from "../ui/icons";

/* The printed card is the copy that still works when the house server is down. */
export function PrintButton() {
  return (
    <button
      type="button"
      className={buttonClass("secondary", "no-print shrink-0")}
      onClick={() => window.print()}
    >
      <Icon name="printer" />
      Print
    </button>
  );
}
