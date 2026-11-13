/*
 * The house guide for share-link visitors: no account, no app shell.
 *
 * Every route under app/g/ authenticates itself by its link token — see the
 * guard table in docs/ARCHITECTURE.md. Headers for this subtree (no-store,
 * no-referrer, noindex) are set in next.config.ts.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "House Guide",
  robots: { index: false, follow: false, nocache: true },
  // No Open Graph: a link pasted into a chat must not unfurl into a preview.
  openGraph: null,
  twitter: null,
};

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">{children}</main>;
}
