import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line bg-card ${className}`}>
      {children}
    </div>
  );
}

/*
 * A link or button passed as a Section's `action` gets a 44px tap target
 * here, whatever its own classes say, so every caller's "Add" or "All" is one.
 * The header row is that tall with the margins around it drawn in to match, so
 * the title sits where a 20px row would put it.
 */
const SECTION_ACTION =
  "flex shrink-0 items-center gap-1 text-sm text-accent " +
  "[&>a]:inline-flex [&>a]:min-h-11 [&>a]:min-w-11 [&>a]:items-center [&>a]:justify-end " +
  "[&>button]:inline-flex [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:items-center [&>button]:justify-end";

/**
 * A titled block on a page, with an optional action on the right. With no
 * children (an empty list) it is the header alone, with its add action.
 */
export function Section({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section className="mt-3" id={id}>
      <div className="-mb-1 flex min-h-11 items-center justify-between gap-2 px-1">
        <h2 className="min-w-0 wrap-anywhere text-sm font-semibold uppercase tracking-wide text-ink-3">
          {title}
        </h2>
        {action ? <div className={SECTION_ACTION}>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A list inside a card, rows separated by hairlines. */
export function List({ children }: { children: ReactNode }) {
  return (
    <Card>
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}

/**
 * One tappable row: icon, title, a line of detail, and a chevron. `trailing`
 * (a call button, say) sits beside the link, never inside it — a link inside a
 * link is invalid HTML and breaks hydration.
 */
export function Row({
  href,
  icon,
  title,
  detail,
  trailing,
}: {
  href?: string;
  icon?: IconName;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      {icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block wrap-anywhere text-[15px] font-medium text-ink">
          {title}
        </span>
        {detail ? (
          <span className="block wrap-anywhere text-sm text-ink-3">
            {detail}
          </span>
        ) : null}
      </span>
      {href && !trailing ? (
        <Icon name="chevron" className="h-4 w-4 shrink-0 text-ink-3" />
      ) : null}
    </>
  );
  return (
    <li className="flex items-center">
      {href ? (
        <Link
          href={href}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 hover:bg-sunk"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5">
          {body}
        </div>
      )}
      {trailing ? <div className="shrink-0 pr-3">{trailing}</div> : null}
    </li>
  );
}

export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="px-4 py-6 text-center">
      <p className="text-[15px] text-ink-3">{children}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

/** Label/value pairs, for specs and details. */
export function Facts({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  const shown = items.filter(
    (i) => i.value !== "" && i.value !== null && i.value !== undefined,
  );
  if (shown.length === 0) return null;
  return (
    <Card>
      <dl className="divide-y divide-line">
        {shown.map((item) => (
          <div
            key={item.label}
            className="flex items-baseline justify-between gap-4 px-4 py-3"
          >
            <dt className="shrink-0 text-sm text-ink-3">{item.label}</dt>
            <dd className="min-w-0 wrap-anywhere text-right text-[15px] text-ink">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "danger";
}) {
  const tones = {
    neutral: "bg-sunk text-ink-2",
    accent: "bg-accent-soft text-accent",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
