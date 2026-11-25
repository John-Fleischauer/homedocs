import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { Card, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { clientIp } from "@/lib/web/client-ip";
import { viewer } from "@/lib/web/context";
import {
  homeAction,
  nameAction,
  passwordAction,
  rebuildSearchAction,
  removeIntegrationAction,
  requirePaperlessTagAction,
  revokeConnectorAction,
  saveIntegrationAction,
  unrequirePaperlessTagAction,
} from "./actions";
import { LinkPicker } from "@/components/LinkPicker";
import { listIntegrations } from "@/lib/integrations/integrations";
import { ConfirmInline } from "@/components/ConfirmInline";
import { Icon } from "@/components/ui/icons";
import { List } from "@/components/ui/Card";
import { listGrants } from "@/lib/oauth/grants";
import { absoluteUrl } from "@/lib/web/urls";
import { timeAgo } from "@/lib/web/format";
import { CopyButton } from "@/components/CopyButton";
import { ThemeChoice } from "@/components/ThemeChoice";
import {
  HomeForm,
  IntegrationForm,
  NameForm,
  PasswordForm,
  RebuildSearch,
} from "./forms";

export const metadata = { title: "Settings" };

/* The trash, asked in place; its name says what it disconnects or removes. */
function TrashConfirm({
  verb,
  what,
  action,
}: {
  verb: string;
  what: string;
  action: () => Promise<unknown>;
}) {
  return (
    <ConfirmInline
      action={action}
      verb={verb}
      subject={what}
      trigger={<Icon name="trash" className="h-[18px] w-[18px]" />}
      triggerLabel={`${verb} ${what}`}
      triggerClass="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunk hover:text-danger"
    />
  );
}

export default async function SettingsPage() {
  const { user, property, scope } = await viewer();
  const [row] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id));
  const seenAs = clientIp(await headers());
  const grants = await listGrants(db, user.id);
  const mcpUrl = absoluteUrl("/mcp");
  const connected =
    user.role === "admin" ? await listIntegrations(db, scope) : [];
  return (
    <>
      <PageHeader title="Settings" back={{ href: "/more", label: "More" }} />
      <Section title="You">
        <Card className="flex flex-col gap-6 p-4">
          <NameForm action={nameAction} name={user.displayName} />
          <ThemeChoice />
          <PasswordForm
            action={passwordAction}
            hasPassword={Boolean(row?.hash)}
          />
        </Card>
      </Section>
      {user.role === "admin" ? (
        <Section title="Home">
          <Card className="p-4">
            <HomeForm action={homeAction} initial={property} seenAs={seenAs} />
          </Card>
        </Section>
      ) : null}
      <Section title="Connected Apps">
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-ink-3">
            Custom connector address for Claude
          </p>
          <code className="break-all rounded bg-sunk px-2 py-1.5 text-xs text-ink">
            {mcpUrl}
          </code>
          <CopyButton text={mcpUrl} label="Copy Address" />
        </Card>
        {grants.length ? (
          <div className="mt-3">
            <List>
              {grants.map((g) => (
                <li
                  key={g.clientId}
                  className="flex min-h-14 items-center gap-3 px-4 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block wrap-anywhere text-[15px] font-medium text-ink">
                      {g.clientName}
                    </span>
                    <span className="block text-sm text-ink-3">
                      {g.scopes.includes("homedocs:write")
                        ? "Looks up and changes"
                        : "Looks up"}
                      {g.lastUsedAt ? ` · used ${timeAgo(g.lastUsedAt)}` : ""}
                    </span>
                  </span>
                  <TrashConfirm
                    verb="Disconnect"
                    what={g.clientName}
                    action={revokeConnectorAction.bind(null, g.clientId)}
                  />
                </li>
              ))}
            </List>
          </div>
        ) : null}
      </Section>
      {user.role === "admin" ? (
        <Section title="Integrations">
          <p className="mb-2 px-1 text-sm text-ink-3">
            Link Homebox items and paperless documents
          </p>
          <div className="flex flex-col gap-3">
            {(["homebox", "paperless"] as const).map((system) => {
              const row = connected.find((c) => c.system === system);
              return (
                <Card key={system} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-semibold text-ink">
                      {system === "homebox" ? "Homebox" : "paperless-ngx"}
                    </p>
                    {row ? (
                      <TrashConfirm
                        verb="Disconnect"
                        what={system === "homebox" ? "Homebox" : "paperless"}
                        action={removeIntegrationAction.bind(null, system)}
                      />
                    ) : null}
                  </div>
                  <IntegrationForm
                    action={saveIntegrationAction.bind(null, system)}
                    system={system}
                    initial={
                      row
                        ? { baseUrl: row.baseUrl, lastStatus: row.lastStatus }
                        : undefined
                    }
                  />
                  {system === "paperless" && row ? (
                    <div className="flex flex-col gap-2 border-t border-line pt-3">
                      <p className="text-sm font-medium text-ink-2">
                        Only Documents Tagged
                      </p>
                      <p className="-mt-1 text-xs text-ink-3">
                        For when paperless also holds papers that aren’t this
                        home’s
                      </p>
                      {row.requiredTags.length ? (
                        <ul className="flex flex-wrap gap-2">
                          {row.requiredTags.map((t) => (
                            <li
                              key={t.id}
                              className="inline-flex min-h-11 min-w-0 items-center rounded-full border border-accent bg-accent-soft pl-3 text-sm text-accent"
                            >
                              <span className="min-w-0 wrap-anywhere">
                                {t.name}
                              </span>
                              <TrashConfirm
                                verb="Remove"
                                what={`the ${t.name} filter`}
                                action={unrequirePaperlessTagAction.bind(
                                  null,
                                  t.id,
                                )}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <LinkPicker
                        systems={[
                          {
                            system: "paperless",
                            name: "paperless",
                            kind: "tag",
                            label: row.requiredTags.length
                              ? "Add Tag"
                              : "Pick Tag",
                          },
                        ]}
                        link={requirePaperlessTagAction}
                      />
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}
      {user.role === "admin" ? (
        <Section title="Maintenance">
          <Card className="p-4">
            <RebuildSearch action={rebuildSearchAction} />
          </Card>
        </Section>
      ) : null}
    </>
  );
}
