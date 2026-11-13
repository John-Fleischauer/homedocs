import type { Attachment } from '@/lib/files/attachments'
import { DeleteButton } from './DeleteButton'
import { Icon } from './ui/icons'

/*
 * A grid of a record's photos and files. `base` is where files are served from.
 * With `hero`, a leading photo spans the full width: for a fixture, the first
 * picture ("the shutoff is here, behind the furnace") is usually the answer.
 *
 * This is a server component, so `remove` must be a server action and is
 * bound per photo: an inline arrow can't cross to the client DeleteButton.
 */
export function Photos({
  items,
  remove,
  base = '/api/files',
  hero = false,
}: {
  items: Attachment[]
  remove?: (id: string) => Promise<unknown>
  base?: string
  hero?: boolean
}) {
  if (items.length === 0) return null
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((a, i) => {
        const big = hero && i === 0 && a.mime.startsWith('image/')
        return (
          <li key={a.id} className={`relative overflow-hidden rounded-card border border-line bg-card ${big ? 'col-span-2 sm:col-span-3' : ''}`}>
            <a href={`${base}/${a.sha256}`} target="_blank" rel="noreferrer" className="block">
              {a.mime.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
                <img
                  src={big ? `${base}/${a.sha256}` : `${base}/${a.sha256}?thumb=1`}
                  alt={a.caption || 'Photo'}
                  loading={big ? 'eager' : 'lazy'}
                  className={big ? 'max-h-96 w-full object-cover' : 'aspect-[4/3] w-full object-cover'}
                />
              ) : (
                <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-ink-3">
                  <Icon name="note" className="h-8 w-8" />
                  <span className="px-2 text-center text-xs">{a.originalName || 'Document'}</span>
                </span>
              )}
            </a>
            {a.caption ? <p className="px-2 py-1.5 text-xs text-ink-2">{a.caption}</p> : null}
            {remove ? (
              <div className="absolute right-1 top-1 rounded-full bg-card">
                <DeleteButton compact recoverable={false} what="this photo" label="Remove" action={remove.bind(null, a.id)} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
