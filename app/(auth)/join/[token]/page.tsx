import { LinkButton } from "@/components/ui/Button";
import { findOpenInvite } from "@/lib/auth/invites";
import { JoinForm } from "./join-form";

export const metadata = { title: "Join" };

const ROLE_TEXT = {
  admin: "You can change anything and invite others",
  member: "You can look things up, and add or change them",
  viewer: "You can look things up",
} as const;

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findOpenInvite(token);

  if (!invite) {
    return (
      <>
        <h2 className="mb-2 text-xl font-semibold text-ink">Link Expired</h2>
        <p className="mb-6 text-[15px] text-ink-3">
          Links work once, for a week. Ask for a new one
        </p>
        <LinkButton href="/login" className="w-full">
          Sign In
        </LinkButton>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-2 text-xl font-semibold text-ink">
        {invite.kind === "invite"
          ? "You’re Invited"
          : `Set Password${invite.label ? ` for ${invite.label}` : ""}`}
      </h2>
      {invite.kind === "invite" ? (
        <p className="mb-6 text-[15px] text-ink-3">{ROLE_TEXT[invite.role]}</p>
      ) : (
        <div className="mb-4" />
      )}
      <JoinForm token={token} kind={invite.kind} />
    </>
  );
}
