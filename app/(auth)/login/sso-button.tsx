import { buttonClass } from "@/components/ui/Button";

/* A link, not a form: starting a sign-on is a navigation, and it works with no script. */
export function SsoButton({
  name,
  next,
  only,
}: {
  name: string;
  next?: string;
  only: boolean;
}) {
  const href = next
    ? `/login/oidc?${new URLSearchParams({ next })}`
    : "/login/oidc";
  return (
    <a
      href={href}
      className={buttonClass(only ? "primary" : "secondary", "w-full")}
    >
      Sign in with {name}
    </a>
  );
}
