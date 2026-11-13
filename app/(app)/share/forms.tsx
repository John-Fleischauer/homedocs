"use client";

import { ConfirmInline } from "@/components/ConfirmInline";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import type { FormAction } from "@/components/ActionForm";
import { buttonClass } from "@/components/ui/Button";
import { Field, Select, SubmitButton, TextInput } from "@/components/ui/Field";
import { PlaceSelect } from "@/components/PlaceSelect";
import type { ActionResult } from "@/lib/web/action";
import { useClearOnSuccess } from "@/lib/keep-form-values";

function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

export function ShareForm({
  action,
  places,
}: {
  action: FormAction;
  places: { id: string; label: string }[];
}) {
  const form = useClearOnSuccess(action);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    form.action,
    {},
  );
  const [pin, setPin] = useState("");
  return (
    <form
      action={formAction}
      onReset={form.onReset}
      className="flex flex-col gap-4"
    >
      <Field label="Who It’s For">
        <TextInput
          name="label"
          placeholder="Pet sitter, Thanksgiving week"
          required
        />
      </Field>
      <Field label="Works For">
        <Select name="days" defaultValue="7">
          {[1, 3, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d === 1 ? "1 day" : `${d} days`}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="PIN"
        hint="Optional. Shows codes and address away from the house; send it separately from the link"
      >
        <div className="flex gap-2">
          <TextInput
            name="pin"
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          <button
            type="button"
            className={buttonClass("secondary", "shrink-0")}
            onClick={() => setPin(randomPin())}
          >
            Make One
          </button>
        </div>
      </Field>
      {places.length ? (
        <Field label="Limit to Place" hint="Fixtures with no place always show">
          <PlaceSelect
            name="rootSpaceId"
            options={places}
            emptyLabel="Whole property"
          />
        </Field>
      ) : null}
      {state.error ? (
        <p className="text-sm text-danger">{state.error}</p>
      ) : null}
      {state.message ? (
        <div className="flex flex-col gap-2 rounded-control bg-accent-soft p-3">
          <p className="text-sm text-accent">
            Here’s the link — it’s shown only now.
            {pin ? ` Send the PIN (${pin}) separately.` : ""}
          </p>
          <code className="break-all rounded bg-card px-2 py-1.5 text-xs text-ink">
            {state.message}
          </code>
          <CopyButton text={state.message} label="Copy Link" />
        </div>
      ) : (
        <SubmitButton pendingText="Making link…">Make Link</SubmitButton>
      )}
    </form>
  );
}

export function RevokeLink({ action }: { action: () => Promise<unknown> }) {
  return (
    <ConfirmInline
      action={action}
      verb="Turn Off"
      subject="this link"
      triggerClass={buttonClass("danger", "min-h-9 px-3 text-sm")}
      note="Anyone using it loses access"
    />
  );
}
