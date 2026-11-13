"use client";

import { useRef, useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { HEADING_PRESETS, withHeadings } from "@/lib/parts/formula";
import {
  CATEGORIES,
  TEMPLATES,
  type Category,
  type TemplateField,
} from "@/lib/parts/templates";
import { UseFields } from "./use-fields";

export function PartForm({
  action,
  initial,
  owner,
  submit,
}: {
  action: FormAction;
  initial?: {
    category?: Category;
    name?: string;
    fields?: Record<string, string>;
    unit?: string;
    extraUnits?: string[];
    buyUrl?: string;
    notes?: string;
    updatedAt?: string;
  };
  /** Set when adding from a fixture or place page: the part is linked there too. */
  owner?: { kind: "fixture" | "place"; id: string; name: string };
  submit: string;
}) {
  const [category, setCategory] = useState<Category>(
    initial?.category ?? "bulb",
  );
  const template = TEMPLATES[category];
  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      {owner ? (
        <input
          type="hidden"
          name={owner.kind === "fixture" ? "fixtureId" : "spaceId"}
          value={owner.id}
        />
      ) : null}
      <Field label="Kind">
        <Select
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TEMPLATES[c].label}
            </option>
          ))}
        </Select>
      </Field>
      {template.tip ? (
        <p className="rounded-control bg-accent-soft px-3 py-2 text-sm text-accent">
          {template.tip}
        </p>
      ) : null}
      {template.fields.map((f) =>
        f.key === "formula" ? (
          <FormulaField
            key={`${category}-${f.key}`}
            field={f}
            initial={initial?.fields?.[f.key]}
          />
        ) : (
          <Field key={`${category}-${f.key}`} label={f.label} hint={f.hint}>
            {f.multiline ? (
              <TextArea
                name={`f_${f.key}`}
                defaultValue={initial?.fields?.[f.key]}
                placeholder={f.placeholder}
              />
            ) : (
              <TextInput
                name={`f_${f.key}`}
                defaultValue={initial?.fields?.[f.key]}
                placeholder={f.placeholder}
              />
            )}
          </Field>
        ),
      )}
      <Field label="Name" hint="Leave blank to use the details above">
        <TextInput name="name" defaultValue={initial?.name} />
      </Field>
      <Field label="Sold By" hint="Usual unit first, then others: roll, bale">
        <TextInput
          key={`units-${category}`}
          name="units"
          defaultValue={[
            initial?.unit ?? template.unit,
            ...(initial?.extraUnits ?? []),
          ]
            .filter(Boolean)
            .join(", ")}
          placeholder={template.unit}
        />
      </Field>
      <Field label="Where to Buy">
        <TextInput
          name="buyUrl"
          type="url"
          inputMode="url"
          defaultValue={initial?.buyUrl}
        />
      </Field>
      <Field label="Notes">
        <TextArea name="notes" defaultValue={initial?.notes} />
      </Field>
      {owner ? (
        <UseFields
          key={category}
          unit={template.unit}
          finishes={template.finishes}
          ownerKind={owner.kind}
        />
      ) : null}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}

/* The tint formula, with a quick way to start it with the label's column headings. */
function FormulaField({
  field,
  initial,
}: {
  field: TemplateField;
  initial?: string;
}) {
  const text = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <Field label={field.label} hint={field.hint}>
        <TextArea
          ref={text}
          name={`f_${field.key}`}
          defaultValue={initial}
          placeholder={field.placeholder}
          rows={4}
        />
      </Field>
      <Select
        aria-label="Add Column Headings"
        value=""
        onChange={(e) => {
          const box = text.current;
          if (!box || !e.target.value) return;
          box.value = withHeadings(box.value, e.target.value);
          box.focus();
          box.setSelectionRange(box.value.length, box.value.length);
        }}
      >
        <option value="">Add Column Headings…</option>
        {HEADING_PRESETS.map((p) => (
          <option key={p.line} value={p.line}>
            {p.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
