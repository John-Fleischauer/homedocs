import { db } from '@/lib/db'
import type { Owner } from '@/lib/files/attachments'
import { listLinks, SYSTEM_LABEL } from '@/lib/links/links'
import { addLinkAction, linkPickedAction, removeLinkAction } from '@/lib/web/link-actions'
import { listIntegrations, refreshStale, SYSTEM_NAME } from '@/lib/integrations/integrations'
import { LinkPicker } from './LinkPicker'
import { LinkThumb } from './LinkThumb'
import { viewer } from '@/lib/web/context'
import { DeleteButton } from './DeleteButton'
import { LinkForm } from './LinkForm'
import { List, Pill, Section } from './ui/Card'

/* Links from a record to Homebox and Home Assistant, and pasted addresses. paperless documents list under Documents. */
export async function LinksSection({ owner, canEdit }: { owner: Owner; canEdit: boolean }) {
  const { scope } = await viewer()
  // paperless documents, tags and correspondents show under Documents (DocumentsSection).
  const own = async () => (await listLinks(db, scope, owner)).filter((l) => l.system !== 'paperless')
  let links = await own()
  const connected = await listIntegrations(db, scope)
  if (links.length && connected.length) {
    // Re-check links not looked at in a day, within a short time budget.
    await refreshStale(db, scope, links.map((l) => l.id))
    links = await own()
  }
  if (links.length === 0 && !canEdit) return null
  const thumbable = new Set(connected.map((c) => c.system))
  const homebox = connected.some((c) => c.system === 'homebox')
  return (
    <Section title="Linked">
      <div className="flex flex-col gap-3">
        {links.length ? (
          <List>
            {links.map((l) => (
              <li key={l.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  <LinkThumb src={thumbable.has(l.system) && l.status === 'ok' ? `/api/ext/${l.system}/${l.externalId}/thumb` : null} />
                  <span className="min-w-0">
                    <span className="block wrap-anywhere text-[15px] font-medium text-ink">{l.title}</span>
                    <span className="flex items-center gap-2 text-sm text-ink-3">
                      <span className="min-w-0 wrap-anywhere">{[SYSTEM_LABEL[l.system], l.subtitle].filter(Boolean).join(' · ')}</span>
                      {l.status === 'missing' ? <Pill tone="warn">Missing</Pill> : null}
                      {l.status === 'auth_error' ? <Pill tone="warn">Reconnect</Pill> : null}
                    </span>
                  </span>
                </a>
                {canEdit ? <DeleteButton compact what="this link" recoverable={false} label="Remove" action={removeLinkAction.bind(null, l.id)} /> : null}
              </li>
            ))}
          </List>
        ) : null}
        {canEdit && homebox ? (
          <LinkPicker
            systems={[{ system: 'homebox', name: SYSTEM_NAME.homebox }]}
            link={linkPickedAction.bind(null, `${owner.kind}:${owner.id}`)}
          />
        ) : null}
        {canEdit ? <LinkForm action={addLinkAction.bind(null, `${owner.kind}:${owner.id}`)} /> : null}
      </div>
    </Section>
  )
}
