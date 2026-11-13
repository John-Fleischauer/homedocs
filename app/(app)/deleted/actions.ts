'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { TRASH_KINDS, restore } from '@/lib/trash/trash'
import { act } from '@/lib/web/action'
import { id, oneOf } from '@/lib/web/fields'

export async function restoreAction(kind: string, recordId: string) {
  return act(
    { kind, id: recordId },
    z.object({ kind: oneOf(TRASH_KINDS, 'That can’t be restored.'), id: id() }),
    async (input, { scope, actor }) => {
      await restore(db, scope, actor, input.kind, input.id)
    },
  )
}
