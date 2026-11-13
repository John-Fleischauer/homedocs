"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { buttonClass, type Variant } from "./Button";

const CONTROL =
  "w-full rounded-control border border-line bg-card px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-3 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

/*
 * Password managers read "name", "phone" and "email" as the person filling in
 * the form, so they offer to fill a Place's name or a plumber's phone with your
 * own. Fields here describe the house, not you: unless a field asks for an
 * autocomplete token (sign-in, a new account), managers are told to stay out.
 * 1Password ignores autocomplete="off" and needs its own attribute.
 */
function noAutofill(autoComplete: string | undefined) {
  if (autoComplete && autoComplete !== "off") return { autoComplete };
  return {
    autoComplete: "off",
    "data-1p-ignore": "",
    "data-lpignore": "true",
    "data-bwignore": "",
    "data-form-type": "other",
  };
}

export function TextInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      {...noAutofill(props.autoComplete)}
      className={`${CONTROL} ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={3}
      {...props}
      {...noAutofill(props.autoComplete)}
      className={`${CONTROL} ${props.className ?? ""}`}
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  return (
    <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />
  );
}

export function Checkbox({
  label,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-1">
      <input
        type="checkbox"
        {...props}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="flex flex-col">
        <span className="text-[15px] text-ink">{label}</span>
        {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className = "",
  pendingText,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, className)}
    >
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
