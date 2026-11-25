"use client";

import { ActionForm, type FormAction } from "@/components/ActionForm";
import { SubmitButton } from "@/components/ui/Field";
import { UseFields } from "../../parts/use-fields";

export function ActionFormClient({
  action,
  unit,
  units,
  finishes,
  ownerKind,
  initial,
}: {
  action: FormAction;
  unit: string;
  units: string[];
  finishes?: string[];
  ownerKind: "fixture" | "place";
  initial: {
    surface: string;
    finish: string;
    quantity: string | null;
    unit: string;
    quantityNeeded: string | null;
    notes: string;
  };
}) {
  return (
    <ActionForm action={action}>
      <UseFields
        unit={unit}
        units={units}
        finishes={finishes}
        ownerKind={ownerKind}
        initial={initial}
      />
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}
