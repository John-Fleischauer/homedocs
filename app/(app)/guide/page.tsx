import Link from "next/link";
import { GuideView } from "@/components/guide/GuideView";
import { LinkButton, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { roleAtLeast } from "@/lib/core/types";
import { db } from "@/lib/db";
import { auditReveal, buildGuide } from "@/lib/guide/guide";
import { viewer } from "@/lib/web/context";

export const metadata = { title: "House Guide" };

/*
 * The guide as family sees it. Codes are hidden until asked for, and asking is
 * audited — a family member can always see them, but there is a record of when.
 */
export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { scope, user, actor } = await viewer();
  const show = (await searchParams).show === "codes";
  if (show) await auditReveal(db, actor, scope.propertyId);
  const guide = await buildGuide(db, scope, { unlocked: show });
  const canEdit = roleAtLeast(user.role, "member");

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {canEdit ? (
          <LinkButton href="/guide/edit">Edit Guide</LinkButton>
        ) : null}
        {user.role === "admin" ? (
          <LinkButton href="/share">Share with Housesitter</LinkButton>
        ) : null}
      </div>
      <GuideView
        guide={guide}
        fileBase="/api/files"
        lockSlot={
          <Card className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm text-ink-3">
              Codes, address and private notes hidden
            </p>
            <Link
              href="/guide?show=codes"
              className={buttonClass("primary", "shrink-0")}
            >
              Show
            </Link>
          </Card>
        }
      />
    </>
  );
}
