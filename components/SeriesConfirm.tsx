"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonClass } from "./ui/Button";

type Ask = { changes: string[]; then: () => void };

/**
 * The one modal confirm (John's answer to Q12): a write that goes back to a
 * series changes what every later project in it starts from, so it lists each
 * change before it's made. Everything else confirms in place (ConfirmInline).
 *
 * `ask(changes, then)` opens it; render `dialog` once in the component. A
 * native <dialog>: focus is kept inside it, Escape closes it, and it starts on
 * Cancel.
 */
export function useSeriesConfirm(): [
  ask: (changes: string[], then: () => void) => void,
  dialog: React.ReactNode,
] {
  const [asking, setAsking] = useState<Ask | null>(null);
  return [
    (changes, then) => setAsking({ changes, then }),
    <SeriesDialog
      key="series-confirm"
      asking={asking}
      close={() => setAsking(null)}
    />,
  ];
}

function SeriesDialog({
  asking,
  close,
}: {
  asking: Ask | null;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /* One of these per list on a project page, so the heading's id is unique. */
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (asking && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!asking && dialog.open) dialog.close();
  }, [asking]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={close}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-card border border-line bg-card p-0 text-ink shadow-lg"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 id={titleId} className="text-[17px] font-semibold">
          Update the Series?
        </h2>
        <p className="text-sm text-ink-3">Next time starts from this</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] text-ink-2">
          {asking?.changes.map((change, i) => (
            <li key={i} className="wrap-anywhere">
              {change}
            </li>
          ))}
        </ul>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className={buttonClass("secondary")}
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className={buttonClass("primary")}
            onClick={() => {
              asking?.then();
              close();
            }}
          >
            Update Series
          </button>
        </div>
      </div>
    </dialog>
  );
}
