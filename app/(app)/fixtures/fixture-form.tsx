"use client";

import Link from "next/link";
import { useState } from "react";
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
import { focusUnlessTouch } from "@/components/ui/focus";
import { guessFixtureKind, listedKind } from "@/lib/fixtures/kind-labels";
import { guessSystemKey } from "@/lib/systems/seeds";

export function FixtureForm({
  action,
  places,
  systems,
  kinds,
  initial,
  submit,
}: {
  action: FormAction;
  places: { id: string; label: string }[];
  systems: { id: string; name: string; seedKey: string | null }[];
  /** The family's list (lib/fixtures/kinds.ts), in the order to offer it. */
  kinds: string[];
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
  const stored = initial?.category ?? "";
  // A kind this fixture has that the list doesn't (removed since, or typed before there was a list) stays an option, so saving never drops it.
  const offList = stored && !listedKind(kinds, stored) ? stored : null;
  const [kind, setKind] = useState(listedKind(kinds, stored) ?? stored);
  const [systemId, setSystemId] = useState(initial?.systemId ?? "");
  // Until someone picks one themselves, an empty kind follows the name ("Hall light" → Light), and an empty system follows the kind and name ("Gas shutoff" → Gas).
  const [followKind, setFollowKind] = useState(!stored);
  const [followSystem, setFollowSystem] = useState(!initial?.systemId);
  const [name, setName] = useState(initial?.name ?? "");
  function guessSystem(kind: string, name: string) {
    if (!followSystem) return;
    const key = guessSystemKey(kind, name);
    setSystemId(systems.find((s) => s.seedKey === key)?.id ?? "");
  }
  function rename(next: string) {
    setName(next);
    const k = followKind ? (guessFixtureKind(next, kinds) ?? "") : kind;
    setKind(k);
    guessSystem(k, next);
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
          onChange={(e) => rename(e.target.value)}
          placeholder="Overhead light"
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
      <div className="flex flex-col">
        <div className="-my-1.5 flex items-center justify-between">
          <label
            htmlFor="fixture-kind"
            className="text-sm font-medium text-ink-2"
          >
            Kind
          </label>
          <Link
            href="/fixtures/kinds"
            className="flex min-h-11 items-center px-1 text-sm text-accent"
          >
            Edit List
          </Link>
        </div>
        <Select
          id="fixture-kind"
          name="category"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setFollowKind(false);
            guessSystem(e.target.value, name);
          }}
        >
          <option value="">—</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          {offList ? <option value={offList}>{offList}</option> : null}
        </Select>
      </div>
      <Field label="System">
        <Select
          name="systemId"
          value={systemId}
          onChange={(e) => {
            setSystemId(e.target.value);
            setFollowSystem(false);
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
        hint="For housesitters, with its photo"
        checked={inGuide}
        onChange={(e) => setInGuide(e.target.checked)}
      />
      {inGuide ? (
        <Field label="Instructions for Housesitters">
          <TextArea
            name="guideNote"
            defaultValue={initial?.guideNote}
            placeholder="Where it is and how to use it"
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
