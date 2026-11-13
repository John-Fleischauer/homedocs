"use client";

import { ActionForm, type FormAction } from "@/components/ActionForm";
import { PlaceSelect } from "@/components/PlaceSelect";
import {
  Checkbox,
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { guessSystemKey } from "@/lib/systems/seeds";
import { useState } from "react";
import { focusUnlessTouch } from "@/components/ui/focus";

export function FixtureForm({
  action,
  places,
  systems,
  categories,
  initial,
  submit,
}: {
  action: FormAction;
  places: { id: string; label: string }[];
  systems: { id: string; name: string; seedKey: string | null }[];
  categories: string[];
  initial?: {
    name?: string;
    spaceId?: string | null;
    systemId?: string | null;
    category?: string;
    notes?: string;
    inGuide?: boolean;
    guideNote?: string;
    updatedAt?: string;
  };
  submit: string;
}) {
  const [inGuide, setInGuide] = useState(initial?.inGuide ?? false);
  const [systemId, setSystemId] = useState(initial?.systemId ?? "");
  // Until someone picks a system themselves, an empty one follows the name and kind ("Gas shutoff" → Gas).
  const [follow, setFollow] = useState(!initial?.systemId);
  const [typed, setTyped] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "",
  });
  function retype(next: Partial<typeof typed>) {
    const t = { ...typed, ...next };
    setTyped(t);
    if (!follow) return;
    const key = guessSystemKey(t.category, t.name);
    setSystemId(systems.find((s) => s.seedKey === key)?.id ?? "");
  }
  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Name">
        <TextInput
          name="name"
          defaultValue={initial?.name}
          onChange={(e) => retype({ name: e.target.value })}
          placeholder="Overhead light, Main water shutoff"
          required
          ref={initial?.name ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="Place">
        <PlaceSelect
          name="spaceId"
          defaultValue={initial?.spaceId ?? ""}
          options={places}
        />
      </Field>
      <Field label="Kind">
        <TextInput
          name="category"
          list="fixture-categories"
          defaultValue={initial?.category}
          onChange={(e) => retype({ category: e.target.value })}
        />
        <datalist id="fixture-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="System">
        <Select
          name="systemId"
          value={systemId}
          onChange={(e) => {
            setSystemId(e.target.value);
            setFollow(false);
          }}
        >
          <option value="">None</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes">
        <TextArea name="notes" defaultValue={initial?.notes} />
      </Field>
      <Checkbox
        name="inGuide"
        label="Show on House Guide"
        checked={inGuide}
        onChange={(e) => setInGuide(e.target.checked)}
      />
      {inGuide ? (
        <Field label="House Guide Note">
          <TextArea
            name="guideNote"
            defaultValue={initial?.guideNote}
            placeholder="Turn the red handle a quarter turn."
          />
        </Field>
      ) : (
        <input
          type="hidden"
          name="guideNote"
          value={initial?.guideNote ?? ""}
        />
      )}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
