"use client";

import { useActionState } from "react";
import {
  Field,
  FormError,
  SubmitButton,
  TextInput,
} from "@/components/ui/Field";
import { loginAction, type FormState } from "../actions";
import { keepFormValues } from "@/lib/keep-form-values";
import { focusUnlessTouch } from "@/components/ui/focus";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form
      action={action}
      onReset={keepFormValues}
      className="flex flex-col gap-4"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email">
        <TextInput
          name="email"
          type="email"
          autoComplete="username"
          required
          ref={focusUnlessTouch}
        />
      </Field>
      <Field label="Password">
        <TextInput
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Signing in…">Sign In</SubmitButton>
    </form>
  );
}
