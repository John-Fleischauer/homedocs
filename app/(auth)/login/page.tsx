import { redirect } from "next/navigation";
import { FormError } from "@/components/ui/Field";
import { getCurrentUser } from "@/lib/auth/guards";
import { signInOptions } from "@/lib/auth/oidc";
import { isSignInError, signInErrorMessage } from "@/lib/auth/oidc-flow";
import { DEFAULT_AFTER_LOGIN, safeNext } from "@/lib/auth/redirects";
import { needsSetup } from "@/lib/auth/users";
import { LoginForm } from "./login-form";
import { SsoButton } from "./sso-button";

export const metadata = { title: "Sign In" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}) {
  if (await needsSetup()) redirect("/setup");

  const params = await searchParams;
  const raw = params.next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  if (await getCurrentUser()) redirect(next);

  const options = await signInOptions();
  const code = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = isSignInError(code)
    ? signInErrorMessage(code, options.sso?.name ?? "Single sign-on")
    : undefined;
  const carried = next === DEFAULT_AFTER_LOGIN ? undefined : next;

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold text-ink">Sign In</h2>
      <div className="flex flex-col gap-4">
        <FormError>{error}</FormError>
        {options.sso ? (
          <SsoButton
            name={options.sso.name}
            next={carried}
            only={!options.password}
          />
        ) : null}
        {options.sso && options.password ? (
          <p className="text-center text-sm text-ink-3">or</p>
        ) : null}
        {options.password ? <LoginForm next={next} /> : null}
        <p className="mt-2 text-sm text-ink-3">
          New here? Ask for an invite link.
        </p>
      </div>
    </>
  );
}
