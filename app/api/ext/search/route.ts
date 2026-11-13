/*
 * Search Homebox (items, or `kind=location`) or paperless (documents, or `kind=tag|correspondent`) for the link picker. Guard: requireApiRole('member')
 * — viewers cannot link, so they have no reason to search the other apps.
 * The token never leaves the server; the browser gets titles and ids.
 */

import { requireApiRole } from '@/lib/auth/guards'
import { AppError } from '@/lib/core/types'
import { db } from '@/lib/db'
import { searchSystem } from '@/lib/integrations/integrations'
import { listProperties } from '@/lib/property/property'
import { collect } from '@/lib/web/fields'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/*
 * The query, parsed. `kind` narrows the search only where the system has it
 * (Homebox locations, paperless tags or correspondents); anything else searches
 * the default, as before.
 */
const searchQuery = z.object({
  system: z.enum(['homebox', 'paperless'], { error: 'Unknown app.' }),
  q: z.string({ error: 'Search for text.' }).max(500, { error: 'That search is too long.' }).optional(),
  kind: z.string({ error: 'Unknown kind.' }).max(50, { error: 'Unknown kind.' }).optional(),
})

export async function GET(request: Request) {
  const auth = await requireApiRole('member')
  if ('response' in auth) return auth.response
  const parsed = searchQuery.safeParse(collect(new URL(request.url).searchParams))
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Unknown app.' }, { status: 400 })
  const { system, q = '', kind: asked } = parsed.data
  const [property] = await listProperties()
  if (!property) return Response.json({ hits: [] })
  try {
    const kind =
      system === 'homebox' && asked === 'location'
        ? 'location'
        : system === 'paperless' && (asked === 'tag' || asked === 'correspondent')
          ? asked
          : undefined
    const hits = await searchSystem(db, { propertyId: property.id }, system, q, kind)
    return Response.json({ hits }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof AppError) return Response.json({ error: err.message }, { status: 400 })
    throw err
  }
}
