"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Checkbox,
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { focusUnlessTouch } from "@/components/ui/focus";

export function SectionForm({
  action,
  initial,
}: {
  action: FormAction;
  initial?: {
    title: string;
    body: string;
    sensitive: boolean;
    updatedAt: string;
  };
}) {
  return (
    <ActionForm action={action}>
      {initial ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Title">
        <TextInput
          name="title"
          defaultValue={initial?.title}
          placeholder="Trash day, The dog, Thermostat"
          required
          ref={initial ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="Note">
        <TextArea name="body" rows={6} defaultValue={initial?.body} />
      </Field>
      <Checkbox
        name="sensitive"
        label="Private"
        hint="Only at the house, or with the link’s PIN"
        defaultChecked={initial?.sensitive}
      />
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

const KINDS = [
  ["wifi", "Wi-Fi"],
  ["alarm", "Alarm Code"],
  ["lockbox", "Lockbox / Key Safe"],
  ["gate", "Gate or Garage Code"],
  ["other", "Other"],
] as const;

export function SecretForm({
  action,
  initial,
}: {
  action: FormAction;
  initial?: {
    kind: string;
    label: string;
    ssid?: string;
    security?: string;
    gate: string;
    inGuide: boolean;
    notes: string;
  };
}) {
  const [kind, setKind] = useState(initial?.kind ?? "wifi");
  const editing = Boolean(initial);
  return (
    <ActionForm action={action}>
      <Field label="Kind">
        <Select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "wifi" ? (
        <>
          <Field label="Network Name">
            <TextInput name="ssid" defaultValue={initial?.ssid} required />
          </Field>
          <Field label="Security">
            <Select name="security" defaultValue={initial?.security ?? "WPA"}>
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">None</option>
            </Select>
          </Field>
        </>
      ) : null}
      <Field label="Label" hint={kind === "wifi" ? "Optional" : undefined}>
        <TextInput name="label" defaultValue={initial?.label} />
      </Field>
      <Field
        label={kind === "wifi" ? "Password" : "Code"}
        hint={
          editing ? "Leave blank to keep the current one" : "Stored encrypted"
        }
      >
        <TextInput
          name="value"
          type="text"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Who Sees It on a Shared Link">
        {/* Keyed by kind: an uncontrolled select keeps its first default, so
            switching Wi-Fi → Alarm would otherwise leave the code visible to
            anyone with the link. */}
        <Select
          key={kind}
          name="gate"
          defaultValue={
            initial?.kind === kind
              ? initial.gate
              : kind === "wifi"
                ? "always"
                : "home_or_pin"
          }
        >
          <option value="home_or_pin">
            Only at the house, or with the link’s PIN
          </option>
          <option value="always">Anyone with the link</option>
        </Select>
      </Field>
      {kind === "wifi" ? (
        <p className="-mt-2 text-xs text-ink-3">
          They need the password before they’re on the Wi-Fi.
        </p>
      ) : null}
      <Checkbox
        name="inGuide"
        label="Show on House Guide"
        defaultChecked={initial?.inGuide ?? true}
      />
      <Field label="Notes">
        <TextArea name="notes" rows={2} defaultValue={initial?.notes} />
      </Field>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}
