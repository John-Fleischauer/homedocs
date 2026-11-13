import Link from 'next/link'
import { DocumentsSection } from '@/components/DocumentsSection'
import { LinksSection } from '@/components/LinksSection'
import { PhotoUpload } from '@/components/PhotoUpload'
import { Photos } from '@/components/Photos'
import { LinkButton } from '@/components/ui/Button'
import { Card, Facts, Section } from '@/components/ui/Card'
import { Icon } from '@/components/ui/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { roleAtLeast } from '@/lib/core/types'
import { db } from '@/lib/db'
import { listAttachments } from '@/lib/files/attachments'
import { listNotes, suggestedNeed } from '@/lib/notes/notes'
import { listUses } from '@/lib/parts/parts'
import { editedBy } from '@/lib/web/attribution'
import { viewer } from '@/lib/web/context'
import { formatDay, formatMoney, formatQty, plural } from '@/lib/web/format'
import { removeAttachmentAction } from '@/lib/web/shared-actions'
import { notFound } from 'next/navigation'
import { ApplyNeed } from './apply-need'

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { scope, user } = await viewer()
  const [row] = await listNotes(db, scope, { id })
  if (!row) notFound()
  const { note } = row
  const [photos, edited] = await Promise.all([listAttachments(db, scope, { kind: 'log', id }), editedBy(note)])
  const canEdit = roleAtLeast(user.role, 'member')

  // The one-tap "really needs" update, when this note's lesson has a number in it.
  const need = suggestedNeed(note)
  let applicable: { where: string; unit: string } | null = null
  let remembered: string | null = null
  if (need !== null && note.supplyId && (note.spaceId || note.fixtureId)) {
    const uses = await listUses(db, scope, note.fixtureId ? { fixtureId: note.fixtureId } : { spaceId: note.spaceId! })
    const use = uses.find((u) => u.part.id === note.supplyId)
    const unit = plural(use?.unit || note.unit || '')
    if (use && Number(use.quantityNeeded ?? NaN) === need) remembered = `${use.owner.name} really needs ${need} ${unit}.`
    else if (use && canEdit) applicable = { where: use.owner.name, unit }
  }

  const about = [
    row.spaceName && note.spaceId ? { href: `/places/${note.spaceId}`, label: row.spaceName, icon: 'place' as const } : null,
    row.fixtureName && note.fixtureId ? { href: `/fixtures/${note.fixtureId}`, label: row.fixtureName, icon: 'fixture' as const } : null,
    row.supplyName && note.supplyId ? { href: `/parts/${note.supplyId}`, label: row.supplyName, icon: 'part' as const } : null,
    row.contactName && note.contactId ? { href: `/contacts/${note.contactId}`, label: row.contactName, icon: 'contact' as const } : null,
    row.projectTitle && note.projectId ? { href: `/projects/${note.projectId}`, label: row.projectTitle, icon: 'project' as const } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <>
      <PageHeader
        title={note.title}
        subtitle={formatDay(note.happenedOn)}
        back={{ href: '/notes', label: 'Notes' }}
        actions={canEdit ? <LinkButton href={`/notes/${id}/edit`}>Edit</LinkButton> : null}
      />

      {about.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {about.map((a) => (
            <Link key={a.href} href={a.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm text-ink-2 hover:bg-sunk">
              <Icon name={a.icon} className="h-4 w-4 text-accent" />
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}

      {note.nextTime ? (
        <div className="rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-warn">
          <p className="text-[15px]">
            <span className="font-semibold">Next Time:</span> {note.nextTime}
          </p>
          {note.remindAfter ? <p className="mt-1 text-xs">Reminder around {formatDay(note.remindAfter)}</p> : null}
          {applicable && need !== null ? <ApplyNeed noteId={id} need={need} unit={applicable.unit} where={applicable.where} /> : null}
          {remembered ? <p className="mt-2 text-sm font-medium">✓ Remembered: {remembered}</p> : null}
        </div>
      ) : null}

      <div className="mt-4">
        <Facts
          items={[
            { label: 'Amount', value: formatQty(note.quantity, note.unit) },
            { label: 'Cost', value: formatMoney(note.cost) },
          ]}
        />
      </div>

      {note.body ? (
        <Section title="Details">
          <Card className="px-4 py-3">
            <p className="whitespace-pre-wrap text-[15px] text-ink-2">{note.body}</p>
          </Card>
        </Section>
      ) : null}

      <Section title="Photos and Files">
        <div className="flex flex-col gap-3">
          <Photos items={photos} remove={canEdit ? removeAttachmentAction : undefined} />
          {canEdit ? <PhotoUpload owner={`log:${id}`} label="Add Photo or File" /> : null}
        </div>
      </Section>

      <DocumentsSection owner={{ kind: 'log', id }} canEdit={canEdit} />
      <LinksSection owner={{ kind: 'log', id }} canEdit={canEdit} />

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  )
}
