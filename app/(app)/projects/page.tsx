import Link from 'next/link'
import { EmptyState, List, Row, Section } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { roleAtLeast } from '@/lib/core/types'
import { db } from '@/lib/db'
import { listProjects, PRIORITY_LABEL, STATUS_LABEL, STATUSES } from '@/lib/projects/projects'
import { listSeries } from '@/lib/projects/series'
import { formatDay } from '@/lib/web/format'
import { viewer } from '@/lib/web/context'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const { scope, user } = await viewer()
  const [projects, series] = await Promise.all([listProjects(db, scope), listSeries(db, scope)])
  const canEdit = roleAtLeast(user.role, 'member')
  const seriesSection =
    series.length || (canEdit && projects.length) ? (
      <Section
        title="Series"
        action={canEdit ? <Link href="/projects/series/new" className="inline-flex min-h-11 items-center text-sm text-accent">New Series</Link> : null}
      >
        {series.length ? (
          <List>
            {series.map((s) => (
              <Row
                key={s.id}
                href={`/projects/series/${s.id}`}
                icon="project"
                title={s.title}
                detail={[
                  s.projectCount === 1 ? '1 project' : `${s.projectCount} projects`,
                  s.lastStarted ? `last ${new Date(s.lastStarted).getFullYear()}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </List>
        ) : (
          <p className="px-1 text-sm text-ink-3">
            None yet. A series is a recurring job: each new project starts from its checklist and materials
          </p>
        )}
      </Section>
    ) : null
  return (
    <>
      <PageHeader
        title="Projects"
        actions={canEdit ? <LinkButton href="/projects/new" variant="primary">Add</LinkButton> : null}
      />
      {seriesSection}
      {projects.length === 0 ? (
        <EmptyState action={canEdit ? <LinkButton href="/projects/new" variant="primary">Add Project</LinkButton> : null}>
          No projects yet
        </EmptyState>
      ) : (
        STATUSES.filter((s) => projects.some((p) => p.status === s)).map((s) => (
          <Section key={s} title={STATUS_LABEL[s]}>
            <List>
              {projects
                .filter((p) => p.status === s)
                .map((p) => (
                  <Row
                    key={p.id}
                    href={`/projects/${p.id}`}
                    icon="project"
                    title={p.title}
                    detail={[
                      p.priority !== 'normal' ? PRIORITY_LABEL[p.priority] : '',
                      p.targetDate ? `by ${formatDay(p.targetDate)}` : '',
                      p.openItems ? `${p.openItems} to do` : '',
                      p.quoteCount ? `${p.quoteCount} quote${p.quoteCount === 1 ? '' : 's'}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))}
            </List>
          </Section>
        ))
      )}
    </>
  )
}
