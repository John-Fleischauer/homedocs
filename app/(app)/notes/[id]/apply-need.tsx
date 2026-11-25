"use client";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/ui/Field";
import { applyNeedAction } from "../actions";

export function ApplyNeed({
  noteId,
  need,
  unit,
}: {
  noteId: string;
  need: number;
  unit: string;
}) {
  return (
    <ActionForm
      action={applyNeedAction.bind(null, noteId)}
      className="mt-3 flex flex-col gap-2"
    >
      <SubmitButton variant="secondary" pendingText="Saving…">
        Set Amount Needed to {need} {unit}
      </SubmitButton>
    </ActionForm>
  );
}
