import { redirect } from 'next/navigation'
import { signInOptions } from '@/lib/auth/oidc'
import { needsSetup } from '@/lib/auth/users'
import { SetupForm } from './setup-form'

export const metadata = { title: 'Set Up' }

/*
 * Disables itself once a user exists — checked here so the form never renders,
 * and again inside createFirstAdmin under an advisory lock so a direct POST
 * cannot race past it.
 */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login')
  const { sso } = await signInOptions()
  return (
    <>
      <h2 className="mb-2 text-xl font-semibold text-ink">Welcome</h2>
      <p className="mb-6 text-[15px] text-ink-3">
        You’ll be the admin, and can invite the family later
      </p>
      <SetupForm />
      {sso ? (
        /* The first account is made here, never by a sign-on (docs/DECISIONS.md). */
        <p className="mt-4 text-sm text-ink-3">
          To use {sso.name}, set up with a password first, then sign in with {sso.name} using the same email address. It links to this account.
        </p>
      ) : null}
    </>
  )
}
