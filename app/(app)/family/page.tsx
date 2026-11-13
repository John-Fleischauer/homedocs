import { DeleteButton } from '@/components/DeleteButton'
import { Card, List, Pill, Section } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { listOpenInvites } from '@/lib/auth/invites'
import { requireRole } from '@/lib/auth/guards'
import { listAwaitingPlacement, listUsers } from '@/lib/auth/users'
import { placementRole, signInOptions, ssoLinkNeedsVerifiedEmail } from '@/lib/auth/oidc'
import { formatDay, localDay } from '@/lib/web/format'
import {
  addMemberAction,
  inviteAction,
  placeAction,
  removeAwaitingAction,
  removeUserAction,
  resetAction,
  revokeInviteAction,
  setRoleAction,
} from './actions'
import { AddMemberForm, InviteForm, PlaceForm, ResetLink, RevokeButton, RoleSelect, ROLE_HELP } from './parts'

export const metadata = { title: 'Family' }

export default async function FamilyPage() {
  const me = await requireRole('admin')
  const [people, awaiting, invites, signIn] = await Promise.all([listUsers(), listAwaitingPlacement(), listOpenInvites(), signInOptions()])
  return (
    <>
      <PageHeader title="Family" back={{ href: '/more', label: 'More' }} />
      {awaiting.length ? (
        <Section title="Awaiting Placement">
          <p className="mb-2 px-1 text-sm text-ink-3">
            Signed in with {signIn.sso?.name ?? 'single sign-on'} and matched nobody here. They can’t see anything until you let them in.
          </p>
          <List>
            {awaiting.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block break-words text-[15px] font-medium text-ink">{a.displayName}</span>
                  <span className="block break-words text-sm text-ink-3">
                    {a.email} · signed in {formatDay(localDay(a.createdAt))}
                  </span>
                </span>
                <div className="flex items-center justify-between gap-2">
                  <PlaceForm action={placeAction.bind(null, a.id)} suggested={placementRole()} />
                  <DeleteButton compact what={a.displayName} recoverable={false} label="Remove" action={removeAwaitingAction.bind(null, a.id)} />
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
                  {p.sso ? ' · single sign-on' : p.hasPassword ? '' : ' · not signed in yet'}
                </span>
              </span>
              <RoleSelect role={p.role} setRole={setRoleAction.bind(null, p.id)} disabled={p.id === me.id} />
            </div>
            {p.id !== me.id ? (
              <div className="flex items-center justify-between gap-2">
                {p.hasPassword ? (
                  <ResetLink action={resetAction.bind(null, p.id)} />
                ) : signIn.password ? (
                  <ResetLink action={resetAction.bind(null, p.id)} label="Make Set-Password Link" />
                ) : (
                  <span />
                )}
                <DeleteButton compact what={p.displayName} recoverable={false} label="Remove" action={removeUserAction.bind(null, p.id)} />
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

      <Section title="Invite by Link">
        <Card className="p-4">
          <InviteForm action={inviteAction} />
        </Card>
      </Section>

      {invites.length ? (
        <Section title="Open Invite Links">
          <List>
            {invites.map((i) => (
              <li key={i.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block wrap-anywhere text-[15px] text-ink">
                    {i.kind === 'reset' ? `Password reset for ${i.label}` : i.label || 'Invite'}
                  </span>
                  <span className="block text-sm text-ink-3">
                    {i.kind === 'invite' ? `${ROLE_HELP[i.role].split(' —')[0]} · ` : ''}expires {formatDay(localDay(i.expiresAt))}
                  </span>
                </span>
                <RevokeButton action={revokeInviteAction.bind(null, i.id)} />
              </li>
            ))}
          </List>
        </Section>
      ) : null}
    </>
  )
}
