import { AppShell } from "@/components/AppShell";
import { roleAtLeast } from "@/lib/core/types";
import { viewer } from "@/lib/web/context";

export const dynamic = "force-dynamic";

/* Everything under app/(app)/ is authenticated by sitting under this layout. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const v = await viewer();
  return (
    <AppShell
      homeName={v.property.name}
      canEdit={roleAtLeast(v.user.role, "member")}
    >
      {children}
    </AppShell>
  );
}
