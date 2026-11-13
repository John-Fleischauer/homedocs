'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  addItem,
  addQuote,
  createProject,
  deleteProject,
  removeItem,
  removeQuote,
  setProjectStatus,
  updateItem,
  updateProject,
  updateQuote,
  type Quote,
} from '@/lib/projects/projects'
import {
  addMaterial,
  copySeriesLineToProject,
  removeMaterial,
  updateMaterial,
  updateSeriesFromProject,
  type MaterialOwner,
} from '@/lib/projects/materials'
import { appendLessonToHowTo, createSeriesFromProject } from '@/lib/projects/series'
import { act, type ActionResult } from '@/lib/web/action'
import type { Viewer } from '@/lib/web/context'
import { bool, checked, id, ids, oneOf, optionalId, text, timestamp, withForm } from '@/lib/web/fields'

/* What the project form sends. Status and priority are checked by the domain,
   which says which ones there are; here they only have to be short text. */
const projectFields = {
  title: text(),
  status: text(200).transform((value) => value || undefined),
  priority: text(200).transform((value) => value || undefined),
  targetDate: text(200),
  summary: text(),
  spaceIds: ids(),
  contactId: optionalId(),
}

const byId = z.object({ id: id() })

export async function createProjectAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    fd,
    z.object({ ...projectFields, seriesId: optionalId() }),
    async (input, { scope, actor }) => ({ id: (await createProject(db, scope, actor, input)).id }),
  )
  if (r.error) return r
  redirect(`/projects/${r.id}`)
}

export async function updateProjectAction(projectId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: projectId }),
    z.object({ ...projectFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...input }, { scope, actor }) => {
      await updateProject(db, scope, actor, id, input, updatedAt)
    },
  )
  if (r.error) return r
  redirect(`/projects/${projectId}`)
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  const r = await act({ id: projectId }, byId, async (input, { scope, actor }) => {
    await deleteProject(db, scope, actor, input.id)
  })
  if (r.error) return r
  redirect('/projects')
}

export async function setStatusAction(projectId: string, status: string): Promise<ActionResult> {
  return act({ id: projectId, status }, z.object({ id: id(), status: text(200) }), async (input, { scope, actor }) => {
    await setProjectStatus(db, scope, actor, input.id, input.status)
  })
}

export async function addItemAction(projectId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    withForm(fd, { projectId }),
    z.object({ projectId: id(), text: text(), spaceId: optionalId(), quoteId: optionalId(), oneOff: checked() }),
    async ({ projectId, ...input }, { scope, actor }) => {
      await addItem(db, scope, actor, projectId, input)
    },
  )
}

export async function setItemOneOffAction(itemId: string, oneOff: boolean): Promise<ActionResult> {
  return act({ id: itemId, oneOff }, z.object({ id: id(), oneOff: bool() }), async (input, { scope, actor }) => {
    await updateItem(db, scope, actor, input.id, { oneOff: input.oneOff })
  })
}

export async function toggleItemAction(itemId: string, done: boolean): Promise<ActionResult> {
  return act({ id: itemId, done }, z.object({ id: id(), done: bool() }), async (input, { scope, actor }) => {
    await updateItem(db, scope, actor, input.id, { done: input.done })
  })
}

export async function removeItemAction(itemId: string): Promise<ActionResult> {
  return act({ id: itemId }, byId, async (input, { scope, actor }) => {
    await removeItem(db, scope, actor, input.id)
  })
}

export async function addQuoteAction(projectId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    withForm(fd, { projectId }),
    z.object({ projectId: id(), contactId: optionalId(), amount: text(200), receivedOn: text(200), notes: text() }),
    async ({ projectId, ...input }, { scope, actor }) => {
      await addQuote(db, scope, actor, projectId, input)
    },
  )
}

const QUOTE_STATUSES = ['pending', 'accepted', 'declined'] as const satisfies readonly Quote['status'][]

export async function setQuoteStatusAction(quoteId: string, status: Quote['status']): Promise<ActionResult> {
  return act({ id: quoteId, status }, z.object({ id: id(), status: oneOf(QUOTE_STATUSES) }), async (input, { scope, actor }) => {
    await updateQuote(db, scope, actor, input.id, { status: input.status })
  })
}

export async function removeQuoteAction(quoteId: string): Promise<ActionResult> {
  return act({ id: quoteId }, byId, async (input, { scope, actor }) => {
    await removeQuote(db, scope, actor, input.id)
  })
}

// ─── materials ───────────────────────────────────────────────────────────────

const materialFields = {
  name: text(),
  supplyId: optionalId(),
  quantity: text(200),
  unit: text(200),
  spaceId: optionalId(),
  notes: text(),
}

export async function addMaterialAction(owner: 'project' | 'series', ownerId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    withForm(fd, { owner, ownerId }),
    z.object({ ...materialFields, owner: oneOf(['project', 'series']), ownerId: id(), oneOff: checked() }),
    async ({ owner, ownerId, oneOff, ...input }, { scope, actor }) => {
      const where: MaterialOwner = owner === 'project' ? { projectId: ownerId } : { seriesId: ownerId }
      await addMaterial(db, scope, actor, where, { ...input, oneOff: owner === 'project' && oneOff })
    },
  )
}

export async function updateMaterialAction(materialId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    withForm(fd, { id: materialId }),
    z.object({ ...materialFields, id: id() }),
    async ({ id, ...input }, { scope, actor }) => {
      await updateMaterial(db, scope, actor, id, input)
    },
  )
}

export async function setMaterialOneOffAction(materialId: string, oneOff: boolean): Promise<ActionResult> {
  return act({ id: materialId, oneOff }, z.object({ id: id(), oneOff: bool() }), async (input, { scope, actor }) => {
    await updateMaterial(db, scope, actor, input.id, { oneOff: input.oneOff })
  })
}

export async function removeMaterialAction(materialId: string): Promise<ActionResult> {
  return act({ id: materialId }, byId, async (input, { scope, actor }) => {
    await removeMaterial(db, scope, actor, input.id)
  })
}

// ─── the project's series ────────────────────────────────────────────────────

/* Shared by "send all" and the per-line buttons, so they stay one behaviour. */
async function sendToSeries(
  v: Viewer,
  projectId: string,
  pick: 'all' | { materials?: string[]; items?: string[] },
  seenAt: Date | undefined,
) {
  const { applied } = await updateSeriesFromProject(db, v.scope, v.actor, projectId, pick, seenAt)
  return { message: applied === 1 ? 'Series updated.' : `Series updated (${applied} changes).` }
}

const pickSchema = z.union([
  z.literal('all'),
  z.object({ materials: z.array(id()).max(1_000).optional(), items: z.array(id()).max(1_000).optional() }).strict(),
])

/** Runs only after the person confirmed the listed changes; `seenAt` is the series as that list showed it. */
export async function updateSeriesAction(
  projectId: string,
  pick: 'all' | { materials?: string[]; items?: string[] },
  seenAt: string,
): Promise<ActionResult> {
  return act(
    { projectId, pick, seenAt },
    z.object({ projectId: id(), pick: pickSchema, seenAt: timestamp() }),
    (input, v) => sendToSeries(v, input.projectId, input.pick, input.seenAt),
  )
}

/** One row: a changed or added project line, or a series line missing here (which removes it from the series). */
export async function sendLineToSeriesAction(projectId: string, kind: 'material' | 'item', seenAt: string, rowId: string): Promise<ActionResult> {
  return act(
    { projectId, kind, seenAt, rowId },
    z.object({ projectId: id(), kind: oneOf(['material', 'item']), seenAt: timestamp(), rowId: id() }),
    (input, v) =>
      sendToSeries(v, input.projectId, input.kind === 'material' ? { materials: [input.rowId] } : { items: [input.rowId] }, input.seenAt),
  )
}

export async function copySeriesLineAction(projectId: string, kind: 'material' | 'item', seriesRowId: string): Promise<ActionResult> {
  return act(
    { projectId, kind, rowId: seriesRowId },
    z.object({ projectId: id(), kind: oneOf(['material', 'item']), rowId: id() }),
    async (input, { scope, actor }) => {
      await copySeriesLineToProject(
        db,
        scope,
        actor,
        input.projectId,
        input.kind === 'material' ? { material: input.rowId } : { item: input.rowId },
      )
    },
  )
}

export async function addLessonToHowToAction(noteId: string, seenAt: string): Promise<ActionResult> {
  return act({ noteId, seenAt }, z.object({ noteId: id(), seenAt: timestamp() }), async (input, { scope, actor }) => {
    await appendLessonToHowTo(db, scope, actor, input.noteId, input.seenAt)
  })
}

export async function makeSeriesAction(projectId: string): Promise<ActionResult> {
  const r = await act({ id: projectId }, byId, async (input, { scope, actor }) => ({
    id: (await createSeriesFromProject(db, scope, actor, input.id)).id,
  }))
  if (r.error) return r
  redirect(`/projects/series/${r.id}`)
}
