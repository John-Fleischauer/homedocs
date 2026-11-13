"use client";

import { useMemo, useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { Field, Select, SubmitButton } from "@/components/ui/Field";
import { TEMPLATES, type Category } from "@/lib/parts/templates";
import { UseFields } from "../parts/use-fields";

type PartOption = {
  id: string;
  name: string;
  category: Category;
  summary: string;
};

export function UseForm({
  action,
  parts,
  owner,
}: {
  action: FormAction;
  parts: PartOption[];
  owner: { kind: "fixture" | "place"; id: string };
}) {
  const [selected, setSelected] = useState(parts[0]?.id ?? "");
  const part = useMemo(
    () => parts.find((p) => p.id === selected),
    [parts, selected],
  );
  const template = part ? TEMPLATES[part.category] : undefined;
  return (
    <ActionForm action={action}>
      <input
        type="hidden"
        name={owner.kind === "fixture" ? "fixtureId" : "spaceId"}
        value={owner.id}
      />
      <Field label="Which Part?">
        <Select
          name="supplyId"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          required
        >
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.summary ? ` — ${p.summary}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      {template ? (
        <UseFields
          key={selected}
          unit={template.unit}
          finishes={template.finishes}
          ownerKind={owner.kind}
        />
      ) : null}
      <SubmitButton>Add</SubmitButton>
    </ActionForm>
  );
}
