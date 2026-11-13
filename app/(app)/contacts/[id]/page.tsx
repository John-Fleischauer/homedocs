import Link from "next/link";
import { LinksSection } from "@/components/LinksSection";
import { NoteList } from "@/components/NoteList";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Photos } from "@/components/Photos";
import { LinkButton } from "@/components/ui/Button";
import { Card, Facts, List, Pill, Section } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listAttachments } from "@/lib/files/attachments";
import { listNotes } from "@/lib/notes/notes";
import { getContact, telHref } from "@/lib/contacts/contacts";
import { tradeLabeler } from "@/lib/contacts/trade-labels";
import { getTradeGroups } from "@/lib/contacts/trades";
import { DocumentsSection } from "@/components/DocumentsSection";
import { editedBy } from "@/lib/web/attribution";
import { viewer } from "@/lib/web/context";
import { removeAttachmentAction } from "@/lib/web/shared-actions";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { scope, user } = await viewer();
  const contact = await getContact(db, scope, id);
  const [notes, photos, edited, groups] = await Promise.all([
    listNotes(db, scope, { contactId: id, limit: 20 }),
    listAttachments(db, scope, { kind: "contact", id }),
    editedBy(contact),
    getTradeGroups(db, scope),
  ]);
  const label = tradeLabeler(groups);
  const canEdit = roleAtLeast(user.role, "member");

  return (
    <>
      <PageHeader
        title={contact.name}
        subtitle={contact.company || undefined}
        back={{ href: "/contacts", label: "Contacts" }}
        actions={
          canEdit ? (
            <LinkButton href={`/contacts/${id}/edit`}>Edit</LinkButton>
          ) : null
        }
      />

      {contact.trades.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {contact.trades.map((t) => (
            <Pill key={t.trade} tone={t.preferred ? "accent" : "neutral"}>
              {t.preferred ? (
                <>
                  <span aria-hidden>★{"\u00a0"}</span>
                  <span className="sr-only">Go-to </span>
                  {label(t.trade)}
                </>
              ) : (
                label(t.trade)
              )}
            </Pill>
          ))}
          {contact.inGuide ? <Pill tone="neutral">On House Guide</Pill> : null}
        </div>
      ) : null}

      {contact.phones.length || contact.emails.length || contact.website ? (
        <List>
          {contact.phones.map((p, i) => (
            <li key={`p${i}`}>
              <a
                href={telHref(p.value)}
                className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-sunk"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Icon name="phone" />
                </span>
                <span>
                  <span className="block text-[17px] font-medium text-ink">
                    {p.value}
                  </span>
                  {p.label ? (
                    <span className="block text-sm text-ink-3">{p.label}</span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
          {contact.emails.map((e, i) => (
            <li key={`e${i}`}>
              <a
                href={`mailto:${e.value}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-sunk"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Icon name="mail" />
                </span>
                <span>
                  <span className="block text-[15px] text-ink">{e.value}</span>
                  {e.label ? (
                    <span className="block text-sm text-ink-3">{e.label}</span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
          {contact.website ? (
            <li>
              <a
                href={contact.website}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-sunk"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Icon name="external" />
                </span>
                <span className="min-w-0 wrap-anywhere text-[15px] text-ink">
                  {contact.website.replace(/^https?:\/\//, "")}
                </span>
              </a>
            </li>
          ) : null}
        </List>
      ) : null}

      <div className="mt-4">
        <Facts
          items={[{ label: "Account Number", value: contact.accountNumber }]}
        />
      </div>

      {contact.notes ? (
        <Section title="Notes">
          <Card className="px-4 py-3">
            <p className="whitespace-pre-wrap text-[15px] text-ink-2">
              {contact.notes}
            </p>
          </Card>
        </Section>
      ) : null}

      <Section
        title="Notes"
        action={
          canEdit ? (
            <Link
              href={`/notes/new?contact=${id}`}
              className="text-sm text-accent"
            >
              Add Note
            </Link>
          ) : null
        }
      >
        {notes.length ? (
          <NoteList rows={notes} />
        ) : (
          <p className="px-1 text-sm text-ink-3">None yet</p>
        )}
      </Section>

      <DocumentsSection
        owner={{ kind: "contact", id }}
        kind="correspondent"
        canEdit={canEdit}
      />

      <Section title="Photos and Files">
        <div className="flex flex-col gap-3">
          <Photos
            items={photos}
            remove={canEdit ? removeAttachmentAction : undefined}
          />
          {canEdit ? <PhotoUpload owner={`contact:${id}`} /> : null}
        </div>
      </Section>

      <LinksSection owner={{ kind: "contact", id }} canEdit={canEdit} />

      <p className="mt-8 px-1 text-xs text-ink-3">{edited}</p>
    </>
  );
}
