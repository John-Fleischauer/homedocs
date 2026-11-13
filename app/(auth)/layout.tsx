/* The signed-out shell. Every page here asks the database whether any account
   exists yet, which is a fact about the running deployment, not the build. */
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          homedocs
        </h1>
        <p className="mt-1 text-[15px] text-ink-3">
          Everything about our house, in one place.
        </p>
      </div>
      {children}
    </main>
  );
}
