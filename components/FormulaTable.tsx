import type { Formula } from "@/lib/parts/formula";
import { Card } from "./ui/Card";

/* A paint tint formula laid out like the can's label. Empty cells show a faint dash. */
export function FormulaTable({ formula }: { formula: Formula }) {
  const [first, ...amounts] = formula.headings;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-[15px] tabular-nums">
        <thead>
          <tr className="border-b border-line text-sm text-ink-3">
            <th scope="col" className="px-4 py-2.5 text-left font-normal">
              {first}
            </th>
            {amounts.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="px-2 py-2.5 text-right font-normal last:pr-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {formula.rows.map((row, r) => (
            <tr key={r}>
              <th
                scope="row"
                className="px-4 py-2.5 text-left font-normal text-ink"
              >
                {row.colorant}
              </th>
              {row.amounts.map((a, i) => (
                <td
                  key={i}
                  className={`px-2 py-2.5 text-right last:pr-4 ${a ? "text-ink" : "text-ink-3"}`}
                >
                  {a || "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
