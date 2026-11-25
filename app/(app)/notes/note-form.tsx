"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { PlaceSelect } from "@/components/PlaceSelect";
import { Button } from "@/components/ui/Button";
import {
  Field,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { Icon } from "@/components/ui/icons";
import { tidyUnit, unitChoices } from "@/lib/parts/templates";
import { formatQty, localDay } from "@/lib/web/format";
import { focusUnlessTouch } from "@/components/ui/focus";
import { UnitInput } from "../parts/unit-input";

type Opt = { id: string; label: string };

export type NoteFormOptions = {
  places: Opt[];
  /** `within` is the fixture's place and every place that one is inside. */
  fixtures: (Opt & { spaceId: string | null; within: string[] })[];
  /** `kind` groups the list ("Light Bulb"); `units` is what the part is sold by, usual one first. */
  parts: (Opt & { kind: string; units: string[] })[];
  contacts: Opt[];
  projects: Opt[];
};

export function NoteForm({
  action,
  options,
  initial,
  submit,
}: {
  action: FormAction;
  options: NoteFormOptions;
  initial?: Partial<
    Record<
      | "title"
      | "happenedOn"
      | "body"
      | "spaceId"
      | "fixtureId"
      | "supplyId"
      | "contactId"
      | "projectId"
      | "quantity"
      | "unit"
      | "cost"
      | "nextTime"
      | "remindAfter"
      | "updatedAt",
      string | null
    >
  >;
  submit: string;
}) {
  const v = (k: keyof NonNullable<typeof initial>) => initial?.[k] ?? "";
  const [more, setMore] = useState(
    Boolean(
      initial?.cost ||
      initial?.contactId ||
      initial?.projectId ||
      initial?.body,
    ),
  );
  const today = localDay();

  /*
   * What the entry is about. The three lists follow each other: a place
   * narrows the fixtures to the ones in it, a fixture fills in its place, and
   * a part brings the unit it is sold by.
   */
  const [spaceId, setSpaceId] = useState(v("spaceId"));
  const [fixtureId, setFixtureId] = useState(v("fixtureId"));
  const [supplyId, setSupplyId] = useState(v("supplyId"));
  const part = options.parts.find((p) => p.id === supplyId);
  const [unit, setUnit] = useState(() => tidyUnit(v("unit"), part?.units));
  const fixtures = options.fixtures.filter(
    (f) => !spaceId || f.within.includes(spaceId) || f.id === fixtureId,
  );
  const kinds = [...new Set(options.parts.map((p) => p.kind))];

  const pick = (name: string, label: string, opts: Opt[], value: string) =>
    opts.length ? (
      <Field label={label}>
        <Select name={name} defaultValue={value}>
          <option value="">None</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    ) : (
      <input type="hidden" name={name} value={value} />
    );

  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? (
        <input type="hidden" name="updatedAt" value={initial.updatedAt} />
      ) : null}
      <Field label="Title">
        <TextInput
          name="title"
          defaultValue={v("title")}
          placeholder="Replaced furnace filter"
          required
          ref={initial?.title ? undefined : focusUnlessTouch}
        />
      </Field>
      <Field label="Date">
        <TextInput
          name="happenedOn"
          type="date"
          defaultValue={v("happenedOn") || today}
        />
      </Field>
      <Field label="Place">
        <PlaceSelect
          name="spaceId"
          value={spaceId}
          onChange={(e) => {
            const next = e.target.value;
            setSpaceId(next);
            // A fixture somewhere else isn't what this entry is about any more.
            const fixture = options.fixtures.find((f) => f.id === fixtureId);
            if (next && fixture && !fixture.within.includes(next))
              setFixtureId("");
          }}
          options={options.places}
          emptyLabel="None"
        />
      </Field>
      {fixtures.length ? (
        <Field
          label="Fixture"
          hint={
            spaceId && fixtures.length < options.fixtures.length
              ? "Only fixtures in this place"
              : undefined
          }
        >
          <Select
            name="fixtureId"
            value={fixtureId}
            onChange={(e) => {
              const next = e.target.value;
              setFixtureId(next);
              const place = options.fixtures.find((f) => f.id === next);
              if (!spaceId && place?.spaceId) setSpaceId(place.spaceId);
            }}
          >
            <option value="">None</option>
            {fixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="fixtureId" value="" />
      )}
      {options.parts.length ? (
        <Field label="Part">
          <Select
            name="supplyId"
            value={supplyId}
            onChange={(e) => {
              const next = e.target.value;
              setSupplyId(next);
              const units = options.parts.find((p) => p.id === next)?.units;
              if (units?.[0]) setUnit(units[0]);
            }}
          >
            <option value="">None</option>
            {kinds.map((kind) => (
              <optgroup key={kind} label={kind}>
                {options.parts
                  .filter((p) => p.kind === kind)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="supplyId" value={supplyId} />
      )}
      <div className="grid grid-cols-2 items-start gap-3">
        <Field label="Amount">
          <TextInput
            name="quantity"
            inputMode="decimal"
            defaultValue={formatQty(v("quantity"))}
            placeholder="12"
          />
        </Field>
        <Field label="Unit">
          <UnitInput
            name="unit"
            label="Unit"
            choices={unitChoices(part?.units)}
            value={unit}
            onChange={setUnit}
          />
        </Field>
      </div>
      <Field label="Lesson for Next Time">
        <TextArea
          name="nextTime"
          rows={2}
          defaultValue={v("nextTime")}
          placeholder="Needed 3 more"
        />
      </Field>
      <Field label="Reminder Date" hint="Shows on Home around this date">
        <TextInput
          name="remindAfter"
          type="date"
          defaultValue={v("remindAfter")}
        />
      </Field>
      {more ? (
        <>
          <Field label="Cost">
            <TextInput
              name="cost"
              inputMode="decimal"
              defaultValue={v("cost")}
              placeholder="$"
            />
          </Field>
          {pick("contactId", "Done By", options.contacts, v("contactId"))}
          {pick("projectId", "Project", options.projects, v("projectId"))}
          <Field label="Notes">
            <TextArea name="body" rows={4} defaultValue={v("body")} />
          </Field>
        </>
      ) : (
        <>
          <input type="hidden" name="cost" value={v("cost")} />
          <input type="hidden" name="contactId" value={v("contactId")} />
          <input type="hidden" name="projectId" value={v("projectId")} />
          <input type="hidden" name="body" value={v("body")} />
          <Button onClick={() => setMore(true)}>
            <Icon name="plus" className="h-4 w-4" />
            Cost, Contact and Notes
          </Button>
        </>
      )}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  );
}
