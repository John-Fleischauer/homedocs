import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";
import { Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listParts } from "@/lib/parts/parts";
import { CATEGORIES, summarize, TEMPLATES } from "@/lib/parts/templates";
import { viewer } from "@/lib/web/context";
import { ownerFromParams } from "@/lib/web/owner";
import { addUseAction } from "../parts/actions";
import { UseForm } from "./use-form";

export const metadata = { title: "Add Part" };

/* Add a part to a fixture or place: link a part we already know about, or describe a new one. */
export default async function UsePage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string; space?: string }>;
}) {
  await requireRole("member");
  const { scope } = await viewer();
  const params = await searchParams;
  const owner = await ownerFromParams(scope, params);
  if (!owner) notFound();
  const parts = (await listParts(db, scope)).map(({ part }) => ({
    id: part.id,
    name: part.name,
    category: part.category,
    summary: summarize(part.category, part.fields),
  }));
  const q =
    owner.kind === "fixture" ? `fixture=${owner.id}` : `space=${owner.id}`;

  return (
    <>
      <PageHeader
        title={`Add Part to ${owner.name}`}
        back={{ href: owner.href, label: owner.name }}
      />
      <p className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-3">
        New Part
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <LinkButton key={c} href={`/parts/new?${q}&category=${c}`}>
            {TEMPLATES[c].label}
          </LinkButton>
        ))}
      </div>
      {parts.length ? (
        <Section title="Existing Part">
          <UseForm
            action={addUseAction}
            parts={parts}
            owner={{ kind: owner.kind, id: owner.id }}
          />
        </Section>
      ) : null}
    </>
  );
}
