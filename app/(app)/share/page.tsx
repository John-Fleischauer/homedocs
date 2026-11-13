import { Card, List, Pill, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listShareLinks, recentViews } from "@/lib/guide/share-links";
import { buildTree, flattenTree, listSpaces } from "@/lib/places/places";
import { timeAgo } from "@/lib/web/format";
import { viewer } from "@/lib/web/context";
import { createShareAction, revokeShareAction } from "./actions";
import { RevokeLink, ShareForm } from "./forms";

export const metadata = { title: "Share Links" };

const EVENT = {
  view: "opened",
  unlock: "entered the PIN",
  pin_failed: "wrong PIN",
  locked: "locked out",
} as Record<string, string>;

export default async function SharePage() {
  await requireRole("admin");
  const { scope } = await viewer();
  const [links, spaces] = await Promise.all([
    listShareLinks(db, scope),
    listSpaces(db, scope),
  ]);
  const now = new Date();
  const live = links.filter(
    ({ link }) => !link.revokedAt && link.expiresAt > now,
  );
  const past = links
    .filter(({ link }) => link.revokedAt || link.expiresAt <= now)
    .slice(0, 10);
  const views = new Map(
    await Promise.all(
      live.map(
        async ({ link }) => [link.id, await recentViews(db, link.id)] as const,
      ),
    ),
  );

  return (
    <>
      <PageHeader
        title="Share House Guide"
        subtitle="No account needed"
        back={{ href: "/guide", label: "House Guide" }}
      />
      <Card className="p-4">
        <ShareForm
          action={createShareAction}
          places={flattenTree(buildTree(spaces))}
        />
      </Card>

      {live.length ? (
        <Section title="Active">
          <div className="flex flex-col gap-3">
            {live.map(({ link }) => (
              <Card key={link.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">
                      {link.label}
                    </p>
                    <p className="text-sm text-ink-3">
                      Until{" "}
                      {link.expiresAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      {link.pinHash ? " · has a PIN" : " · no PIN"}
                    </p>
                    {link.lockedAt ? (
                      <Pill tone="danger">PIN Locked</Pill>
                    ) : null}
                  </div>
                  <RevokeLink action={revokeShareAction.bind(null, link.id)} />
                </div>
                {(views.get(link.id) ?? []).length ? (
                  <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-ink-3">
                    {(views.get(link.id) ?? []).slice(0, 6).map((v) => (
                      <li key={v.id}>
                        {EVENT[v.event] ?? v.event} {timeAgo(v.at)}
                        {v.atHome ? " · at the house" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-ink-3">Not opened yet</p>
                )}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {past.length ? (
        <Section title="Expired or Off">
          <List>
            {past.map(({ link, views: n }) => (
              <li key={link.id} className="px-4 py-3 text-sm">
                <span className="text-ink">{link.label}</span>
                <span className="text-ink-3">
                  {" "}
                  · {link.revokedAt ? "turned off" : "expired"} · opened {n}{" "}
                  time{n === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}
