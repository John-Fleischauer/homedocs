"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { Button } from "@/components/ui/Button";
import { SubmitButton, TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/icons";
import { cleanKindNames, kindIcon, kindKey } from "@/lib/fixtures/kind-labels";

/* `was` is the name the server has, so it can tell a rename from a new kind. */
type Row = { id: number; name: string; was?: string };

const ICON_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunk hover:text-ink disabled:cursor-not-allowed disabled:text-line";

/*
 * The Kind dropdown on the fixture form, in the order it is offered. Renaming
 * a kind renames it on its fixtures; a fixture keeps a kind removed from here.
 */
export function KindListForm({
  action,
  initial,
}: {
  action: FormAction;
  initial: string[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((name, id) => ({ id, name, was: name })),
  );
  const [adding, setAdding] = useState("");

  const move = (i: number, by: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      [next[i], next[i + by]] = [next[i + by]!, next[i]!];
      return next;
    });
  /* The rows plus a name still in the Add box, so Save doesn't lose one typed but not added. */
  const withTyped = (rs: Row[]): Row[] => {
    const name = cleanKindNames([adding])[0];
    return !name || rs.some((r) => kindKey(r.name) === kindKey(name))
      ? rs
      : [...rs, { id: Math.max(-1, ...rs.map((r) => r.id)) + 1, name }];
  };
  const add = () => {
    setRows(withTyped);
    setAdding("");
  };
  /* What was saved is what the server has now: the list as it cleans it. */
  const saved = () => {
    const kept = new Set(cleanKindNames(withTyped(rows).map((r) => r.name)));
    const out: Row[] = [];
    for (const r of withTyped(rows)) {
      const name = cleanKindNames([r.name])[0];
      if (!name || !kept.delete(name)) continue;
      out.push({ id: r.id, name, was: name });
    }
    setRows(out);
    setAdding("");
  };

  return (
    <ActionForm action={action} successText="Saved" onSuccess={saved}>
      <input
        type="hidden"
        name="kinds"
        value={JSON.stringify(
          withTyped(rows).map(({ name, was }) => ({ name, was })),
        )}
      />
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const label = r.name.trim() || "kind";
          return (
            <li key={r.id} className="flex items-center gap-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon name={kindIcon(r.name)} className="h-[18px] w-[18px]" />
              </span>
              <TextInput
                value={r.name}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((x) =>
                      x.id === r.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
                aria-label="Kind Name"
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                aria-label={`Move ${label} Up`}
                title="Move Up"
                disabled={i === 0}
                className={ICON_BUTTON}
                onClick={() => move(i, -1)}
              >
                <Icon name="chevron" className="h-4 w-4 -rotate-90" />
              </button>
              <button
                type="button"
                aria-label={`Move ${label} Down`}
                title="Move Down"
                disabled={i === rows.length - 1}
                className={ICON_BUTTON}
                onClick={() => move(i, 1)}
              >
                <Icon name="chevron" className="h-4 w-4 rotate-90" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                title="Remove"
                className={`${ICON_BUTTON} hover:text-danger`}
                onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              >
                <Icon name="trash" className="h-[18px] w-[18px]" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <TextInput
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a kind"
          aria-label="New Kind"
        />
        <Button className="shrink-0" onClick={add}>
          Add
        </Button>
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}
