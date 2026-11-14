import { badgeFor, type StoreLink } from "@/lib/parts/retailers";

/* A store's mark in its own colours (a known retailer) or the app's (any other). Decorative: its name is beside it. */
export function StoreBadge({
  store,
  className = "h-9 w-9",
}: {
  store: Pick<StoreLink, "retailer" | "url">;
  className?: string;
}) {
  const badge = badgeFor(store);
  const size =
    badge.mark.length >= 3
      ? "text-[11px]"
      : badge.mark.length === 2
        ? "text-[13px]"
        : "text-base";
  return (
    <span
      aria-hidden="true"
      data-store-badge=""
      className={`flex shrink-0 items-center justify-center rounded-full font-bold leading-none tracking-tight ${size} ${
        badge.bg ? "" : "bg-accent-soft text-accent"
      } ${className}`}
      style={badge.bg ? { backgroundColor: badge.bg, color: badge.fg } : {}}
    >
      {badge.mark}
    </span>
  );
}
