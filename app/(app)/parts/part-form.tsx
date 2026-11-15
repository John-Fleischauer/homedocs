"use client";

import { useRef, useState, type ReactNode } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { ChoiceInput, YesNoInput } from "@/components/ui/Choice";
import { HEADING_PRESETS, withHeadings } from "@/lib/parts/formula";
import type { StoreLink } from "@/lib/parts/retailers";
import {
  CATEGORIES,
  TEMPLATES,
  type Category,
  type TemplateField,
} from "@/lib/parts/templates";
import { StoreFields } from "./store-fields";
import { UseFields } from "./use-fields";

/* One part of the form under a heading, like a Section on the part's page. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-line pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="float-left w-full text-sm font-semibold uppercase tracking-wide text-ink-3">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

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
    stores?: StoreLink[];
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
      <Group title="What It Is">
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
            <SpecField
              key={`${category}-${f.key}`}
              field={f}
              initial={initial?.fields?.[f.key]}
            />
          ),
        )}
        <Field label="Name" hint="Leave blank to use the details above">
          <TextInput name="name" defaultValue={initial?.name} />
        </Field>
      </Group>
      <Group title="Buying">
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
        <StoreFields initial={initial?.stores} />
      </Group>
      <Group title="Notes">
        <Field label="Notes">
          <TextArea name="notes" defaultValue={initial?.notes} />
        </Field>
      </Group>
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

/* One of the category's details, as the input its answers suit. */
function SpecField({
  field: f,
  initial = "",
}: {
  field: TemplateField;
  initial?: string;
}) {
  const name = `f_${f.key}`;
  // Buttons are their own group, with a legend, not inside a <label>.
  if (f.yesNo)
    return <YesNoInput name={name} label={f.label} defaultValue={initial} />;
  return (
    <Field label={f.label} hint={f.hint}>
      {f.choices ? (
        <ChoiceInput
          name={name}
          label={f.label}
          choices={f.choices}
          defaultValue={initial}
          placeholder={f.placeholder}
        />
      ) : f.multiline ? (
        <TextArea
          name={name}
          defaultValue={initial}
          placeholder={f.placeholder}
        />
      ) : (
        <TextInput
          name={name}
          defaultValue={initial}
          placeholder={f.placeholder}
          inputMode={f.count ? "numeric" : undefined}
        />
      )}
    </Field>
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
