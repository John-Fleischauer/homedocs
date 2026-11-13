import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, List, Pill, Row, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listSecrets, listSections, SECRET_KINDS } from "@/lib/guide/guide";
import { listContacts } from "@/lib/contacts/contacts";
import { tradeLabeler } from "@/lib/contacts/trade-labels";
import { getTradeGroups } from "@/lib/contacts/trades";
import { listFixtures } from "@/lib/fixtures/fixtures";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "Edit Guide" };

export default async function EditGuidePage() {
  await requireRole("member");
  const { scope } = await viewer();
  const [sections, codes, fixtures, contacts, groups] = await Promise.all([
    listSections(db, scope),
    listSecrets(db, scope),
    listFixtures(db, scope),
    listContacts(db, scope),
    getTradeGroups(db, scope),
  ]);
  const label = tradeLabeler(groups);
  const guideFixtures = fixtures.filter((t) => t.inGuide);
  const guideContacts = contacts.filter(
    (p) => p.inGuide || p.trades.some((t) => t.preferred),
  );
  return (
    <>
      <PageHeader
        title="Edit Guide"
        back={{ href: "/guide", label: "House Guide" }}
      />

      <Section title="Emergency Fixtures">
        {guideFixtures.length ? (
          <List>
            {guideFixtures.map((t) => (
              <Row
                key={t.id}
                href={`/fixtures/${t.id}/edit`}
                icon="fixture"
                title={t.name}
                detail={t.guideNote || "No note"}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            action={<LinkButton href="/fixtures">Pick Fixtures</LinkButton>}
          >
            None yet
          </EmptyState>
        )}
      </Section>

      <Section title="Contacts">
        <p className="mb-2 px-1 text-sm text-ink-3">
          Go-to contacts show automatically
        </p>
        {guideContacts.length ? (
          <List>
            {guideContacts.map((p) => (
              <Row
                key={p.id}
                href={`/contacts/${p.id}/edit`}
                icon="contact"
                title={p.name}
                detail={p.trades.map((t) => label(t.trade)).join(", ")}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            action={<LinkButton href="/contacts">Go to Contacts</LinkButton>}
          >
            None yet
          </EmptyState>
        )}
      </Section>

      <Section
        title="Codes"
        action={
          <Link href="/guide/codes/new" className="text-sm text-accent">
            Add
          </Link>
        }
      >
        {codes.length ? (
          <List>
            {codes.map((c) => (
              <Row
                key={c.id}
                href={`/guide/codes/${c.id}`}
                icon="key"
                title={
                  c.kind === "wifi" && c.meta.ssid
                    ? `Wi-Fi: ${c.meta.ssid}`
                    : c.label
                }
                detail={`${SECRET_KINDS.find((k) => k.value === c.kind)?.label} · ${c.gate === "always" ? "anyone with the link" : "at the house or with PIN"}${c.inGuide ? "" : " · not on guide"}`}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            action={
              <LinkButton href="/guide/codes/new">Add Wi-Fi or Code</LinkButton>
            }
          >
            No codes yet
          </EmptyState>
        )}
      </Section>

      <Section
        title="Notes"
        action={
          <Link href="/guide/sections/new" className="text-sm text-accent">
            Add
          </Link>
        }
      >
        {sections.length ? (
          <List>
            {sections.map((s) => (
              <Row
                key={s.id}
                href={`/guide/sections/${s.id}`}
                icon="guide"
                title={s.title}
                trailing={
                  s.sensitive ? <Pill tone="warn">Private</Pill> : undefined
                }
              />
            ))}
          </List>
        ) : (
          <EmptyState
            action={
              <LinkButton href="/guide/sections/new">Add Note</LinkButton>
            }
          >
            None yet
          </EmptyState>
        )}
      </Section>
    </>
  );
}
