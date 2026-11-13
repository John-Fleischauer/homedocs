import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4">
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 mb-1 inline-flex min-h-9 items-center gap-1 wrap-anywhere text-sm text-ink-3 hover:text-ink"
        >
          <Icon name="back" className="h-4 w-4 shrink-0" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="wrap-anywhere text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 wrap-anywhere text-[15px] text-ink-3">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
