import { EmptyState, List, Row } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { listContacts, telHref } from "@/lib/contacts/contacts";
import { tradeLabeler } from "@/lib/contacts/trade-labels";
import { getTradeGroups } from "@/lib/contacts/trades";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const { scope, user } = await viewer();
  const [contacts, groups] = await Promise.all([
    listContacts(db, scope),
    getTradeGroups(db, scope),
  ]);
  const label = tradeLabeler(groups);
  const canEdit = roleAtLeast(user.role, "member");
  return (
    <>
      <PageHeader
        title="Contacts"
        actions={
          canEdit ? (
            <LinkButton href="/contacts/new" variant="primary">
              Add
            </LinkButton>
          ) : null
        }
      />
      {contacts.length ? (
        <List>
          {contacts.map((p) => {
            const phone = p.phones[0]?.value;
            // "★ Plumber, HVAC": the ones they're the go-to for first.
            const ours = p.trades
              .filter((t) => t.preferred)
              .map((t) => `★ ${label(t.trade)}`);
            const other = p.trades
              .filter((t) => !t.preferred)
              .map((t) => label(t.trade));
            return (
              <Row
                key={p.id}
                href={`/contacts/${p.id}`}
                icon="contact"
                title={p.name}
                detail={[p.company, [...ours, ...other].join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  phone ? (
                    <a
                      href={telHref(phone)}
                      aria-label={`Call ${p.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent"
                    >
                      <Icon name="phone" />
                    </a>
                  ) : null
                }
              />
            );
          })}
        </List>
      ) : (
        <EmptyState
          action={
            canEdit ? (
              <LinkButton href="/contacts/new" variant="primary">
                Add Contact
              </LinkButton>
            ) : null
          }
        >
          No contacts yet
        </EmptyState>
      )}
    </>
  );
}
