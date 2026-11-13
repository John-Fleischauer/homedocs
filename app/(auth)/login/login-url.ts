import { absoluteUrl } from "@/lib/web/urls";
import { DEFAULT_AFTER_LOGIN } from "@/lib/auth/redirects";
import type { SignInError } from "@/lib/auth/oidc-flow";

/*
 * Back to the login page with a refusal code, keeping `next` so a retry still
 * lands on the consent screen. Absolute and on the public origin: behind the
 * proxy, a Route Handler's own request URL is the container's address.
 */
export function loginUrl(error: SignInError, next: string): string {
  const params = new URLSearchParams({ error });
  if (next !== DEFAULT_AFTER_LOGIN) params.set("next", next);
  return absoluteUrl(`/login?${params}`);
}
