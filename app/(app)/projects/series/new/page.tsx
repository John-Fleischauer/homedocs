import { PageHeader } from '@/components/ui/PageHeader'
import { requireRole } from '@/lib/auth/guards'
import { listContacts } from '@/lib/contacts/contacts'
import { db } from '@/lib/db'
import { buildTree, flattenTree, listSpaces } from '@/lib/places/places'
import { viewer } from '@/lib/web/context'
import { createSeriesAction } from '../actions'
import { SeriesForm } from '../series-form'

export const metadata = { title: 'New Series' }

export default async function NewSeriesPage() {
  await requireRole('member')
  const { scope } = await viewer()
  const [spaces, contacts] = await Promise.all([listSpaces(db, scope), listContacts(db, scope)])
  return (
    <>
      <PageHeader title="New Series" back={{ href: '/projects', label: 'Projects' }} />
      <p className="mb-4 px-1 text-sm text-ink-3">
        A recurring job: each new project starts from its checklist and materials
      </p>
      <SeriesForm
        action={createSeriesAction}
        places={flattenTree(buildTree(spaces))}
        contacts={contacts.map((c) => ({ id: c.id, label: c.company ? `${c.name} (${c.company})` : c.name }))}
        submit="Add Series"
      />
    </>
  )
}
