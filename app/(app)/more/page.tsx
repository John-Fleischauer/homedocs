import { List, Row, Section } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { logoutAction } from "@/app/(auth)/actions";
import { buttonClass } from "@/components/ui/Button";
import { viewer } from "@/lib/web/context";
import { countAwaitingPlacement } from "@/lib/auth/users";

export const metadata = { title: "More" };

export default async function MorePage() {
  const { user } = await viewer();
  const admin = user.role === "admin";
  /* Someone a sign-on left waiting has no way in until an admin notices. */
  const waiting = admin ? await countAwaitingPlacement() : 0;
  return (
    <>
      <PageHeader title="More" subtitle={`Signed in as ${user.displayName}`} />
      <List>
        <Row href="/systems" icon="system" title="Systems" />
        <Row href="/parts" icon="part" title="Parts" />
        <Row href="/fixtures" icon="fixture" title="Fixtures" />
        <Row href="/notes" icon="note" title="Notes" />
        <Row
          href="/guide"
          icon="guide"
          title="House Guide"
          detail="For housesitters"
        />
      </List>
      <Section title="Settings">
        <List>
          {admin ? (
            <Row
              href="/share"
              icon="link"
              title="Share Links"
              detail="Send house guide"
            />
          ) : null}
          {admin ? (
            <Row
              href="/family"
              icon="contact"
              title="Family"
              detail={waiting ? `${waiting} waiting to be let in` : undefined}
            />
          ) : null}
          <Row href="/deleted" icon="trash" title="Recently Deleted" />
          <Row href="/settings" icon="edit" title="Settings" />
        </List>
      </Section>
      <form action={logoutAction} className="mt-6">
        <button type="submit" className={buttonClass("secondary", "w-full")}>
          Sign Out
        </button>
      </form>
    </>
  );
}
