import {
  HOW_LABEL,
  hostOf,
  storeName,
  type StoreLink,
} from "@/lib/parts/retailers";
import { Card } from "./ui/Card";
import { Icon } from "./ui/icons";
import { StoreBadge } from "./StoreBadge";

/** A part's stores: each with its badge, how it's bought, and its link when it has one. */
export function StoreList({ stores }: { stores: StoreLink[] }) {
  return (
    <Card>
      <ul className="divide-y divide-line">
        {stores.map((store, i) => {
          const name = storeName(store);
          const host = hostOf(store.url);
          const body = (
            <>
              <StoreBadge store={store} />
              <span className="min-w-0 flex-1">
                <span className="block wrap-anywhere text-[15px] font-medium text-ink">
                  {name || "Store"}
                </span>
                <span className="block wrap-anywhere text-sm text-ink-3">
                  {[HOW_LABEL[store.how], host !== name ? host : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {store.url ? (
                <Icon name="external" className="h-4 w-4 shrink-0 text-ink-3" />
              ) : null}
            </>
          );
          const row =
            "flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5";
          return (
            <li key={i} className="flex items-center">
              {store.url ? (
                <a
                  href={store.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${row} hover:bg-sunk`}
                >
                  {body}
                </a>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
