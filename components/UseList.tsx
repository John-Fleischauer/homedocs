import { List, Row } from "./ui/Card";
import type { IconName } from "./ui/icons";
import type { UseView } from "@/lib/parts/parts";
import { summarize, TEMPLATES } from "@/lib/parts/templates";
import { formatQty } from "@/lib/web/format";

/*
 * Part uses, from either side. On a fixture or place page each row is the part
 * ("A19 LED 2700K ×3"); on a part page each row is where it is used.
 */
export function UseList({
  uses,
  show,
}: {
  uses: UseView[];
  show: "part" | "owner";
}) {
  return (
    <List>
      {uses.map((u) => {
        const qty = formatQty(u.quantity, u.unit);
        const needed = u.quantityNeeded
          ? `really needs ${formatQty(u.quantityNeeded, u.unit)}`
          : "";
        const where = [u.surface, u.finish].filter(Boolean).join(", ");
        if (show === "part") {
          return (
            <Row
              key={u.id}
              href={`/parts/${u.part.id}`}
              icon="part"
              title={`${u.part.name}${qty ? ` · ${qty}` : ""}`}
              detail={[
                where,
                needed,
                summarize(u.part.category, u.part.fields) ||
                  TEMPLATES[u.part.category].label,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          );
        }
        const icon: IconName = u.owner.kind === "fixture" ? "fixture" : "place";
        return (
          <Row
            key={u.id}
            href={
              u.owner.kind === "fixture"
                ? `/fixtures/${u.owner.id}`
                : `/places/${u.owner.id}`
            }
            icon={icon}
            title={u.owner.name}
            detail={[u.owner.path, where, qty, needed]
              .filter(Boolean)
              .join(" · ")}
          />
        );
      })}
    </List>
  );
}
