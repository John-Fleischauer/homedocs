'use server'

/* Actions used across record pages. */

import { z } from 'zod'
import { db } from '../db'
import { removeAttachment } from '../files/attachments'
import { act } from './action'
import { id } from './fields'

export async function removeAttachmentAction(attachmentId: string) {
  return act({ id: attachmentId }, z.object({ id: id() }), async (input, { scope, actor }) => {
    await removeAttachment(db, scope, actor, input.id)
  })
}
