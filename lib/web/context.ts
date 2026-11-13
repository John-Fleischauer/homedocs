/*
 * Who is asking, and about which home — for pages and server actions.
 */

import { cookies } from 'next/headers'
import { requireUser, type AuthUser } from '../auth/guards'
import { AppError, type ActorContext, type PropertyScope } from '../core/types'
import { listProperties, type Property } from '../property/property'

export const PROPERTY_COOKIE = 'homedocs_property'

export function webActor(user: AuthUser): ActorContext {
  return { userId: user.id, role: user.role, source: 'web', requestId: crypto.randomUUID() }
}

export type Viewer = {
  user: AuthUser
  actor: ActorContext
  property: Property
  properties: Property[]
  scope: PropertyScope
}

/**
 * The signed-in user and the home they are looking at. The choice of home is a
 * cookie (only meaningful once there are two); a stale or missing cookie falls
 * back to the first.
 */
export async function viewer(): Promise<Viewer> {
  const user = await requireUser()
  const all = await listProperties()
  const wanted = (await cookies()).get(PROPERTY_COOKIE)?.value
  const property = all.find((p) => p.id === wanted) ?? all[0]
  if (!property) throw new AppError('No home exists. Run setup again.', 'no_home')
  return { user, actor: webActor(user), property, properties: all, scope: { propertyId: property.id } }
}
