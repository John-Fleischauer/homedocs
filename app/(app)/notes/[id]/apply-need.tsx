"use client";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/ui/Field";
import { applyNeedAction } from "../actions";

export function ApplyNeed({
  noteId,
  need,
  unit,
  where,
}: {
  noteId: string;
  need: number;
  unit: string;
  where: string;
}) {
  return (
    <ActionForm
      action={applyNeedAction.bind(null, noteId)}
      className="mt-3 flex flex-col gap-2"
    >
      <SubmitButton variant="secondary" pendingText="Saving…">
        Remember that {where} really needs {need} {unit}
      </SubmitButton>
    </ActionForm>
  );
}
