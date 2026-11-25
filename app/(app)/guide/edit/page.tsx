import Link from "next/link";
import { List, Pill, Row, Section } from "@/components/ui/Card";
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

      <Section
        title="Fixtures"
        action={
          <Link
            href="/fixtures"
            className="-my-3 flex min-h-11 items-center px-1 text-sm text-accent"
          >
            All Fixtures
          </Link>
        }
      >
        <p className="mb-2 px-1 text-sm text-ink-3">
          Fixtures with Show on House Guide ticked
        </p>
        {guideFixtures.length ? (
          <List>
            {guideFixtures.map((t) => (
              <Row
                key={t.id}
                href={`/fixtures/${t.id}/edit`}
                icon="fixture"
                title={t.name}
                detail={t.guideNote || "No guide note"}
              />
            ))}
          </List>
        ) : null}
      </Section>

      <Section
        title="Contacts"
        action={
          <Link
            href="/contacts"
            className="-my-3 flex min-h-11 items-center px-1 text-sm text-accent"
          >
            All Contacts
          </Link>
        }
      >
        <p className="mb-2 px-1 text-sm text-ink-3">
          Go-to contacts, and any with Show on House Guide ticked
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
        ) : null}
      </Section>

      <Section
        title="Codes"
        action={
          <Link
            href="/guide/codes/new"
            className="-my-3 flex min-h-11 items-center px-1 text-sm text-accent"
          >
            Add Code
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
                detail={`${SECRET_KINDS.find((k) => k.value === c.kind)?.label} · ${c.gate === "always" ? "no PIN needed" : "needs PIN or house Wi-Fi"}${c.inGuide ? "" : " · not on guide"}`}
              />
            ))}
          </List>
        ) : null}
      </Section>

      <Section
        title="Notes"
        action={
          <Link
            href="/guide/sections/new"
            className="-my-3 flex min-h-11 items-center px-1 text-sm text-accent"
          >
            Add Note
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
        ) : null}
      </Section>
    </>
  );
}
