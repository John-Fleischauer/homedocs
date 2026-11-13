import type { ComponentProps } from "react";
import { Select } from "./ui/Field";

/* Options come pre-flattened from the server: "Main floor › Living room". */
export function PlaceSelect({
  options,
  emptyLabel = "Whole house",
  ...props
}: ComponentProps<"select"> & {
  options: { id: string; label: string }[];
  emptyLabel?: string;
}) {
  return (
    <Select {...props}>
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
