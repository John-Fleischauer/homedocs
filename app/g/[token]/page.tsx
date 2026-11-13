import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/guide/GuideView";
import { SaveOffline } from "@/components/guide/SaveOffline";
import { Card } from "@/components/ui/Card";
import { db } from "@/lib/db";
import {
  isPreviewBot,
  MAX_PIN_FAILURES,
  recordView,
} from "@/lib/guide/share-links";
import { guideFor, resolveVisit } from "@/lib/guide/viewing";
import { clientIp } from "@/lib/web/client-ip";
import { guideLimiter } from "@/lib/web/limits";
import { PinForm } from "./pin-form";

/*
 * Guard: the link token (resolveVisit). Gated content is decided by
 * buildGuide from `unlocked` — at home, or the PIN cookie — never here.
 */
export default async function SharedGuidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const h = await headers();

  // Chat apps fetch a pasted link to build a preview. Show them nothing.
  if (isPreviewBot(h.get("user-agent"))) {
    return <p className="text-ink-3">House Guide</p>;
  }
  if (!guideLimiter.take(clientIp(h) ?? "unknown")) {
    return (
      <p className="py-16 text-center text-ink-3">
        Too many requests. Wait a few minutes and reload.
      </p>
    );
  }

  const visit = await resolveVisit(token);
  if (!visit) notFound();
  const guide = await guideFor(visit);
  await recordView(db, visit.link, {
    ip: visit.ip,
    userAgent: visit.userAgent,
    atHome: visit.atHome,
  });

  const locked =
    visit.link.lockedAt || visit.link.pinFailures >= MAX_PIN_FAILURES;
  const lockSlot = !visit.link.pinHash ? (
    <Card className="p-4 text-sm text-ink-3">
      Codes and the address appear when you’re on the house Wi-Fi
    </Card>
  ) : locked ? (
    <Card className="p-4 text-sm text-ink-3">
      PIN locked after too many tries; codes appear when you’re on the house
      Wi-Fi
    </Card>
  ) : (
    <PinForm token={token} />
  );

  return (
    <>
      <GuideView
        guide={guide}
        fileBase={`/g/${token}/files`}
        lockSlot={lockSlot}
        intro={
          <p className="no-print mb-4 text-xs text-ink-3">
            Shared with {visit.link.label}. This link works until{" "}
            {visit.link.expiresAt.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
            .{visit.atHome ? " You’re at the house, so codes are shown." : ""}
          </p>
        }
      />
      <SaveOffline path={`/g/${token}`} />
    </>
  );
}
