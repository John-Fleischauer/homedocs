"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { Button } from "@/components/ui/Button";
import { SubmitButton, TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/icons";
import { tradeKey, type TradeGroup } from "@/lib/contacts/trade-labels";

/* The chips on the contact and system forms, in groups. Contacts keep a trade removed from here. */
export function TradeListForm({
  action,
  initial,
}: {
  action: FormAction;
  initial: TradeGroup[];
}) {
  const [groups, setGroups] = useState<TradeGroup[]>(initial);
  const [adding, setAdding] = useState<string[]>(initial.map(() => ""));

  const update = (i: number, next: Partial<TradeGroup>) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...next } : g)));
  const add = (i: number) => {
    const name = adding[i]?.trim();
    if (!name) return;
    const taken = groups.some((g) =>
      g.trades.some((t) => tradeKey(t) === tradeKey(name)),
    );
    if (!taken) update(i, { trades: [...groups[i]!.trades, name] });
    setAdding((a) => a.map((v, j) => (j === i ? "" : v)));
  };

  return (
    <ActionForm action={action} successText="Saved">
      <input type="hidden" name="groups" value={JSON.stringify(groups)} />
      {groups.map((g, i) => (
        <section
          key={i}
          className="flex flex-col gap-2 rounded-card border border-line bg-card p-3"
        >
          <TextInput
            value={g.label}
            onChange={(e) => update(i, { label: e.target.value })}
            aria-label="Group Name"
            className="font-medium"
          />
          <ul className="flex flex-wrap gap-2">
            {g.trades.map((t) => (
              <li
                key={t}
                className="inline-flex min-h-11 items-center rounded-full border border-line bg-card pl-3 text-sm text-ink-2"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  className="flex h-11 w-10 items-center justify-center rounded-full text-ink-3 hover:text-danger"
                  onClick={() =>
                    update(i, { trades: g.trades.filter((x) => x !== t) })
                  }
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <TextInput
              value={adding[i] ?? ""}
              onChange={(e) =>
                setAdding((a) =>
                  a.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(i);
                }
              }}
              placeholder="Add one"
              aria-label={`Add to ${g.label || "this group"}`}
            />
            <Button className="shrink-0" onClick={() => add(i)}>
              Add
            </Button>
          </div>
          {g.trades.length === 0 ? (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => {
                setGroups((gs) => gs.filter((_, j) => j !== i));
                setAdding((a) => a.filter((_, j) => j !== i));
              }}
            >
              Remove Group
            </Button>
          ) : null}
        </section>
      ))}
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => {
          setGroups((gs) => [...gs, { label: "", trades: [] }]);
          setAdding((a) => [...a, ""]);
        }}
      >
        Add Group
      </Button>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}
