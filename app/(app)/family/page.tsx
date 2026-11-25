import { ConfirmInline } from "@/components/ConfirmInline";
import { Card, List, Pill, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { listOpenInvites } from "@/lib/auth/invites";
import { requireRole } from "@/lib/auth/guards";
import { listAwaitingPlacement, listUsers } from "@/lib/auth/users";
import {
  placementRole,
  signInOptions,
  ssoLinkNeedsVerifiedEmail,
} from "@/lib/auth/oidc";
import { formatDay, localDay } from "@/lib/web/format";
import {
  addMemberAction,
  inviteAction,
  placeAction,
  removeAwaitingAction,
  removeUserAction,
  resetAction,
  revokeInviteAction,
  setRoleAction,
} from "./actions";
import {
  AddMemberForm,
  InviteForm,
  PlaceForm,
  ResetLink,
  RevokeButton,
  RoleSelect,
} from "./parts";

export const metadata = { title: "Family" };

const ROLE_NAME = { admin: "Admin", member: "Member", viewer: "Viewer" };

/* The trash, asked in place; its name says whom it removes. */
function RemoveButton({
  who,
  action,
}: {
  who: string;
  action: () => Promise<unknown>;
}) {
  return (
    <span className="ml-auto">
      <ConfirmInline
        action={action}
        verb="Remove"
        subject={who}
        note="They can no longer sign in"
        trigger={<Icon name="trash" className="h-[18px] w-[18px]" />}
        triggerLabel={`Remove ${who}`}
        triggerClass="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunk hover:text-danger"
      />
    </span>
  );
}

export default async function FamilyPage() {
  const me = await requireRole("admin");
  const [people, awaiting, invites, signIn] = await Promise.all([
    listUsers(),
    listAwaitingPlacement(),
    listOpenInvites(),
    signInOptions(),
  ]);
  return (
    <>
      <PageHeader title="Family" back={{ href: "/more", label: "More" }} />
      {awaiting.length ? (
        <Section title="Awaiting Placement">
          <p className="mb-2 px-1 text-sm text-ink-3">
            Signed in with {signIn.sso?.name ?? "single sign-on"} but not added
            here. They see nothing until let in
          </p>
          <List>
            {awaiting.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block wrap-anywhere text-[15px] font-medium text-ink">
                    {a.displayName}
                  </span>
                  <span className="block wrap-anywhere text-sm text-ink-3">
                    {a.email} · signed in {formatDay(localDay(a.createdAt))}
                  </span>
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PlaceForm
                    action={placeAction.bind(null, a.id)}
                    suggested={placementRole()}
                  />
                  <RemoveButton
                    who={a.displayName}
                    action={removeAwaitingAction.bind(null, a.id)}
                  />
                </div>
              </li>
            ))}
          </List>
        </Section>
      ) : null}
      <List>
        {people.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block wrap-anywhere text-[15px] font-medium text-ink">
                  {p.displayName} {p.id === me.id ? <Pill>You</Pill> : null}
                </span>
                <span className="block wrap-anywhere text-sm text-ink-3">
                  {p.email}
                  {p.sso
                    ? " · single sign-on"
                    : p.hasPassword
                      ? ""
                      : " · not signed in yet"}
                </span>
              </span>
              <RoleSelect
                role={p.role}
                setRole={setRoleAction.bind(null, p.id)}
                disabled={p.id === me.id}
              />
            </div>
            {p.id !== me.id ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {p.hasPassword || signIn.password ? (
                  <ResetLink action={resetAction.bind(null, p.id)} />
                ) : (
                  <span />
                )}
                <RemoveButton
                  who={p.displayName}
                  action={removeUserAction.bind(null, p.id)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </List>

      <Section title="Add Person">
        <Card className="p-4">
          <AddMemberForm
            action={addMemberAction}
            sso={signIn.sso?.name ?? null}
            password={signIn.password}
            needsVerifiedEmail={ssoLinkNeedsVerifiedEmail()}
          />
        </Card>
      </Section>

      <Card className="mt-4">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-ink">
                Invite by Link
              </span>
              <span className="block text-sm text-ink-3">
                They enter their own email and password
              </span>
            </span>
            <Icon
              name="chevron"
              className="h-4 w-4 shrink-0 text-ink-3 group-open:rotate-90"
            />
          </summary>
          <div className="border-t border-line p-4">
            <InviteForm action={inviteAction} />
          </div>
        </details>
      </Card>

      {invites.length ? (
        <Section title="Open Invite Links">
          <List>
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex min-h-14 items-center gap-3 px-4 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block wrap-anywhere text-[15px] text-ink">
                    {i.kind === "reset"
                      ? `Password link for ${i.label}`
                      : i.label || "Invite"}
                  </span>
                  <span className="block text-sm text-ink-3">
                    {i.kind === "invite" ? `${ROLE_NAME[i.role]} · ` : ""}
                    expires {formatDay(localDay(i.expiresAt))}
                  </span>
                </span>
                <RevokeButton action={revokeInviteAction.bind(null, i.id)} />
              </li>
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}
