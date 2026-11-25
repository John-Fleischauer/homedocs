"use client";

import { ActionForm, type FormAction } from "@/components/ActionForm";
import {
  Field,
  SubmitButton,
  TextArea,
  TextInput,
} from "@/components/ui/Field";
import { Icon } from "@/components/ui/icons";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const SUMMARY =
  "flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden";
const CHEVRON = "h-4 w-4 shrink-0 text-ink-3 group-open:rotate-90";

export function NameForm({
  action,
  name,
}: {
  action: FormAction;
  name: string;
}) {
  return (
    <ActionForm action={action}>
      <Field label="Name">
        <TextInput name="displayName" defaultValue={name} required />
      </Field>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm({
  action,
  hasPassword,
}: {
  action: FormAction;
  hasPassword: boolean;
}) {
  return (
    <details className="group rounded-control border border-line">
      <summary className={SUMMARY}>
        <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
          {hasPassword ? "Change Password" : "Set Password"}
        </span>
        <Icon name="chevron" className={CHEVRON} />
      </summary>
      <div className="border-t border-line p-3">
        <PasswordFields action={action} hasPassword={hasPassword} />
      </div>
    </details>
  );
}

function PasswordFields({
  action,
  hasPassword,
}: {
  action: FormAction;
  hasPassword: boolean;
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      {hasPassword ? (
        <Field label="Current Password">
          <TextInput
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      ) : null}
      <Field
        label="New Password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
      >
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      <SubmitButton variant="secondary">
        {hasPassword ? "Change Password" : "Set Password"}
      </SubmitButton>
    </ActionForm>
  );
}

export function HomeForm({
  action,
  initial,
  seenAs,
}: {
  action: FormAction;
  initial: {
    name: string;
    address: string;
    homeNetworks: string[];
    homeHostname: string;
  };
  seenAs: string | null;
}) {
  return (
    <ActionForm action={action}>
      <Field label="Name">
        <TextInput name="name" defaultValue={initial.name} required />
      </Field>
      <Field label="Address" hint="Shown on the house guide">
        <TextArea name="address" rows={2} defaultValue={initial.address} />
      </Field>
      {/* Rarely touched, so folded; its fields still post with the form. */}
      <details className="group rounded-control border border-line">
        <summary className={SUMMARY}>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">
              Home Network
            </span>
            <span className="block text-sm text-ink-3">
              Where the house guide shows codes without a PIN
            </span>
          </span>
          <Icon name="chevron" className={CHEVRON} />
        </summary>
        <div className="flex flex-col gap-3 border-t border-line p-3">
          {seenAs ? (
            <p className="text-sm text-ink-3">
              This device’s address:{" "}
              <code className="rounded bg-sunk px-1 wrap-anywhere">
                {seenAs}
              </code>
            </p>
          ) : null}
          <Field label="Address Ranges" hint="One per line">
            <TextArea
              name="homeNetworks"
              rows={2}
              placeholder="192.168.1.0/24"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={initial.homeNetworks.join("\n")}
            />
          </Field>
          <Field
            label="Dynamic DNS Name"
            hint="Follows the home’s internet address when it changes"
          >
            <TextInput
              name="homeHostname"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="home.example.com"
              defaultValue={initial.homeHostname}
            />
          </Field>
        </div>
      </details>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

export function IntegrationForm({
  action,
  system,
  initial,
}: {
  action: FormAction;
  system: "homebox" | "paperless";
  initial?: { baseUrl: string; lastStatus: string };
}) {
  const homebox = system === "homebox";
  /* Cleared after a save: the token is a secret, and the form shouldn't keep it on screen. */
  return (
    <ActionForm action={action} resetOnSuccess>
      {initial?.lastStatus ? (
        <p className="text-sm text-accent">Connected: {initial.lastStatus}</p>
      ) : null}
      <Field label="Address">
        <TextInput
          name="baseUrl"
          type="url"
          inputMode="url"
          placeholder={
            homebox
              ? "https://homebox.example.com"
              : "https://paperless.example.com"
          }
          defaultValue={initial?.baseUrl}
          required
        />
      </Field>
      <Field
        label={homebox ? "API Key" : "API Token"}
        hint={
          initial
            ? "Blank keeps the saved one"
            : homebox
              ? "Homebox 0.26+: Profile → API Keys. Starts with hb_"
              : "My Profile → API Auth Token. Safest from a user limited to home documents"
        }
      >
        <TextInput
          name="token"
          type="password"
          autoComplete="off"
          required={!initial}
        />
      </Field>
      <SubmitButton variant="secondary" pendingText="Testing…">
        {initial ? "Save and Test" : "Connect"}
      </SubmitButton>
    </ActionForm>
  );
}

export function RebuildSearch({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action}>
      <p className="text-sm text-ink-3">
        After a restore, or when search misses something
      </p>
      <SubmitButton variant="secondary" pendingText="Rebuilding…">
        Rebuild Search
      </SubmitButton>
    </ActionForm>
  );
}
