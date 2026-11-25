"use client";

import { useActionState, useState, useTransition } from "react";
import { InlineError } from "@/components/useRun";
import { CopyButton } from "@/components/CopyButton";
import { ActionForm, type FormAction } from "@/components/ActionForm";
import { buttonClass } from "@/components/ui/Button";
import { Field, Select, SubmitButton, TextInput } from "@/components/ui/Field";
import type { ActionResult } from "@/lib/web/action";
import { keepFormValues, useClearOnSuccess } from "@/lib/keep-form-values";

const ROLE_NAME = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
} as const;

const ROLE_HINT = {
  admin: "Changes anything, adds people, shares the guide",
  member: "Looks things up, adds and changes them",
  viewer: "Looks things up only",
} as const;

type Role = keyof typeof ROLE_NAME;

const roleOptions = Object.entries(ROLE_NAME).map(([value, name]) => (
  <option key={value} value={value}>
    {name}
  </option>
));

/* The role alone in the dropdown, so it fits a phone; what it allows sits beneath. */
function RoleField() {
  const [role, setRole] = useState<Role>("member");
  return (
    <Field label="Role" hint={ROLE_HINT[role]}>
      <Select
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
      >
        {roleOptions}
      </Select>
    </Field>
  );
}

/* A made link is shown once, with a copy button: it is not stored anywhere readable. */
function MadeLink({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-accent-soft p-3">
      <p className="text-sm text-accent">
        Send them this link. Works once, for 7 days
      </p>
      <code className="break-all rounded bg-card px-2 py-1.5 text-xs text-ink">
        {url}
      </code>
      <CopyButton text={url} />
    </div>
  );
}

export function InviteForm({ action }: { action: FormAction }) {
  const form = useClearOnSuccess(action);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    form.action,
    {},
  );
  return (
    <form
      action={formAction}
      onReset={form.onReset}
      className="flex flex-col gap-3"
    >
      <Field label="Name">
        <TextInput name="label" />
      </Field>
      <RoleField />
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message ? <MadeLink url={state.message} /> : null}
      <SubmitButton variant="secondary" pendingText="Making link…">
        Make Invite Link
      </SubmitButton>
    </form>
  );
}

export function AddMemberForm({
  action,
  sso,
  password,
  needsVerifiedEmail,
}: {
  action: FormAction;
  sso: string | null;
  password: boolean;
  needsVerifiedEmail: boolean;
}) {
  const form = useClearOnSuccess(action);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    form.action,
    {},
  );
  return (
    <form
      action={formAction}
      onReset={form.onReset}
      className="flex flex-col gap-3"
    >
      <Field label="Name">
        <TextInput name="displayName" required />
      </Field>
      <Field
        label="Email"
        hint={
          sso
            ? `The one they use with ${sso}` +
              (needsVerifiedEmail ? `; ${sso} must show it as verified` : "")
            : undefined
        }
      >
        <TextInput name="email" type="email" inputMode="email" required />
      </Field>
      <RoleField />
      {password ? (
        <Field
          label="Password"
          hint={
            sso
              ? `Blank if they use ${sso}`
              : "Blank to send them a password link instead"
          }
        >
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
          />
        </Field>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-accent">
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingText="Adding…">Add Person</SubmitButton>
    </form>
  );
}

/* One link for both cases: it sets a first password, or replaces a forgotten one. */
export function ResetLink({ action }: { action: FormAction }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    action,
    {},
  );
  return (
    <form
      action={formAction}
      onReset={keepFormValues}
      className="flex min-w-0 flex-col gap-2"
    >
      {state.message ? <MadeLink url={state.message} /> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {!state.message ? (
        <SubmitButton
          variant="secondary"
          className="self-start whitespace-nowrap text-sm"
          pendingText="Making link…"
        >
          Make Password Link
        </SubmitButton>
      ) : null}
    </form>
  );
}

export function RoleSelect({
  role,
  setRole,
  disabled,
}: {
  role: string;
  setRole: (r: string) => Promise<ActionResult>;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /* Controlled, so a refused change snaps back to the role that stands, and
     follows the role when a revalidation brings a new one. */
  const [shown, setShown] = useState(role);
  const [was, setWas] = useState(role);
  if (role !== was) {
    setWas(role);
    setShown(role);
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <Select
        aria-label="Role"
        value={shown}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value;
          setShown(next);
          start(async () => {
            setError(null);
            const r = await setRole(next);
            if (r.error) {
              setError(r.error);
              setShown(role);
            }
          });
        }}
        className="max-w-32"
      >
        {roleOptions}
      </Select>
      <InlineError className="max-w-56 text-right">{error}</InlineError>
    </span>
  );
}

export function RevokeButton({ action }: { action: () => Promise<unknown> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("secondary", "shrink-0 text-sm")}
      onClick={() => start(async () => void (await action()))}
    >
      Cancel Link
    </button>
  );
}

/* Letting in an account a single sign-on made: pick what they can do, then Let In. */
export function PlaceForm({
  action,
  suggested,
}: {
  action: FormAction;
  suggested: string;
}) {
  return (
    <ActionForm action={action} className="flex items-center gap-2">
      <Select
        name="role"
        aria-label="Role"
        defaultValue={suggested}
        className="max-w-32 shrink-0"
      >
        {roleOptions}
      </Select>
      <SubmitButton variant="secondary" pendingText="Letting in…">
        Let In
      </SubmitButton>
    </ActionForm>
  );
}
