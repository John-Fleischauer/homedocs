/*
 * The consent screen.
 *
 * Deliberately outside app/(app)/: this is not a page in the house record, it is a
 * decision about access, and wrapping it in the app's navigation invites reading
 * it as one more screen to click through. It authenticates itself rather than by
 * placement, and it is the only page in the app that does — everything under
 * app/(app)/ is guarded by its layout, and everything under app/api/ returns
 * 401s. This one has a third answer: go and log in, then come back *here*, to
 * this request, with its parameters intact.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/guards'
import {
  AuthorizeFatal,
  AuthorizeRedirect,
  SCOPE_DESCRIPTIONS,
  parseAuthorizeParams,
  resolveTarget,
  validateRequest,
} from '@/lib/oauth/authorize'
import { formatScope } from '@/lib/oauth/config'
import { buttonClass } from '@/components/ui/Button'
import { db } from '@/lib/db'
import { approveAction, denyAction } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Authorize Connector — homedocs' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  /* Parsed with zod (parseAuthorizeParams), the same parse the approve and deny
     form runs. A parameter sent twice is malformed, not a list. */
  const raw = parseAuthorizeParams(await searchParams)
  if (!raw) return <Refusal title="This request can’t be read" detail="A parameter was sent twice, or isn’t text. Start connecting again from the app that sent you here." />

  let target
  try {
    target = await resolveTarget(db, raw)
  } catch (err) {
    if (err instanceof AuthorizeFatal) return <Refusal title={err.title} detail={err.detail} />
    throw err
  }

  const user = await getCurrentUser()
  if (!user) {
    /* Back to this exact request afterwards. Dropping the parameters here would
       land them on a bare /oauth/authorize with nothing to approve, and the
       connector would sit waiting for a window that never returns. */
    const next = `/oauth/authorize?${new URLSearchParams(
      Object.entries(raw).filter((e): e is [string, string] => e[1] !== undefined),
    ).toString()}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  let request
  try {
    request = validateRequest(target, raw, user.role)
  } catch (err) {
    // The redirect URI is proven by now, so the client is told in its own terms.
    if (err instanceof AuthorizeRedirect) redirect(err.location())
    throw err
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">homedocs</h1>
        <p className="mt-1 text-[15px] text-ink-3">Everything about our house, in one place.</p>
      </header>

      <h2 className="text-xl font-semibold text-ink">
        Connect <span className="text-accent">{request.client.clientName}</span> to homedocs?
      </h2>
      <p className="mt-2 text-[15px] text-ink-2">
        It is asking to act as {user.displayName} ({user.email}). It will be able to:
      </p>

      <ul className="mt-5 flex flex-col gap-4 border-y border-line py-5">
        {request.scopes.map((scope) => (
          <li key={scope}>
            <p className="text-[15px] font-medium text-ink">{SCOPE_DESCRIPTIONS[scope].label}</p>
            <p className="mt-0.5 text-sm text-ink-2">{SCOPE_DESCRIPTIONS[scope].detail}</p>
          </li>
        ))}
      </ul>

      {request.dropped.length > 0 ? (
        /* Named rather than silently omitted, so the reason is on the screen
           where the decision was made. */
        <p className="mt-4 text-sm text-ink-2">
          It also asked to {formatScope(request.dropped) === 'homedocs:write' ? 'add and change things' : formatScope(request.dropped)},
          which a viewer account can’t allow.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-ink-3">Every change it makes is recorded under your name, and it can never see codes or passwords.</p>

      <form className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="client_id" value={request.client.id} />
        <input type="hidden" name="redirect_uri" value={request.redirectUri} />
        <input type="hidden" name="response_type" value="code" />
        {/* The granted set, not what was asked for — and re-derived server-side
            regardless, so this is a convenience rather than the decision. */}
        <input type="hidden" name="scope" value={formatScope(request.scopes)} />
        <input type="hidden" name="code_challenge" value={request.codeChallenge} />
        <input type="hidden" name="code_challenge_method" value="S256" />
        {request.state ? <input type="hidden" name="state" value={request.state} /> : null}
        {request.resource ? <input type="hidden" name="resource" value={request.resource} /> : null}

        <button type="submit" formAction={approveAction} className={buttonClass('primary', 'w-full')}>
          Approve
        </button>
        <button type="submit" formAction={denyAction} className={buttonClass('secondary', 'w-full')}>
          Cancel
        </button>
      </form>
    </main>
  )
}

/** A request that cannot be answered anywhere but here. */
function Refusal({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">homedocs</h1>
      <h2 className="mt-6 text-xl font-semibold text-danger">{title}</h2>
      <p className="mt-2 text-[15px] text-ink-2">{detail}</p>
      <p className="mt-6 text-sm text-ink-3">Nothing has been approved.</p>
    </main>
  )
}
