/*
 * Upload a photo or PDF onto a record. Guard: requireApiRole('member').
 *
 * A Route Handler rather than a Server Action because Server Actions cap the
 * body at 1 MB and phone photos are 3–8 MB. The browser shrinks photos before
 * sending (components/PhotoUpload.tsx); the cap here is for everything else.
 */

import { requireApiRole } from '@/lib/auth/guards'
import { AppError } from '@/lib/core/types'
import { db } from '@/lib/db'
import { attach, ownerProperty, parseOwner } from '@/lib/files/attachments'
import { MAX_UPLOAD_BYTES, storeUpload } from '@/lib/files/store'
import { webActor } from '@/lib/web/context'
import { readBytes } from '@/lib/web/body'
import { text } from '@/lib/web/fields'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/* One file, and an optional caption that is text. */
const uploadForm = z.object({
  file: z.array(z.instanceof(File), { error: 'Choose a file.' }).min(1, { error: 'Choose a file.' }).max(1, { error: 'Choose one file.' }).transform((files) => files[0]!),
  caption: text(2_000),
})

export async function POST(request: Request) {
  const auth = await requireApiRole('member')
  if ('response' in auth) return auth.response

  const url = new URL(request.url)
  const owner = parseOwner(url.searchParams.get('owner'))
  if (!owner) return Response.json({ error: 'Say what this file belongs to.' }, { status: 400 })

  /* The file plus a little room for the multipart framing and the caption. A
     browser always sends a Content-Length for a FormData body, so one without
     it (411) isn't ours; whatever the header says, the read stops at the cap. */
  const body = await readBytes(request, { max: MAX_UPLOAD_BYTES + 64 * 1024, requireLength: true })
  if (!body.ok) {
    const error =
      body.status === 413 ? 'That file is too big (25 MB at most).' : body.status === 411 ? 'Send the file’s length with it.' : 'The upload did not arrive in one piece. Try again.'
    return Response.json({ error }, { status: body.status })
  }

  let form: FormData
  try {
    form = await new Response(new Uint8Array(body.bytes), { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
  } catch {
    return Response.json({ error: 'The upload did not arrive in one piece. Try again.' }, { status: 400 })
  }
  const parsed = uploadForm.safeParse({ file: form.getAll('file'), caption: form.getAll('caption') })
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Choose a file.' }, { status: 400 })
  const { file, caption } = parsed.data

  const propertyId = await ownerProperty(db, owner)
  if (!propertyId) return Response.json({ error: 'That record no longer exists.' }, { status: 404 })

  try {
    const stored = await storeUpload(Buffer.from(await file.arrayBuffer()), file.type)
    const row = await attach(db, { propertyId }, webActor(auth.user), owner, {
      ...stored,
      originalName: file.name,
      caption,
    })
    return Response.json({ id: row.id, sha256: row.sha256 })
  } catch (err) {
    if (err instanceof AppError) return Response.json({ error: err.message }, { status: 400 })
    throw err
  }
}
