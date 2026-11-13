/* Display helpers shared by pages. Dates are stored as YYYY-MM-DD and shown in words. */

export function formatDay(day: string | null | undefined): string {
  if (!day) return "";
  const date = new Date(`${day}T12:00:00`);
  const thisYear = new Date().getFullYear() === date.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** "12.00" → "12", "2.50" → "2.5". */
export function formatQty(value: string | null | undefined, unit = ""): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : String(n);
  if (!unit) return text;
  return `${text} ${n === 1 ? unit : plural(unit)}`;
}

/* Abbreviations stay as they are: "2 gal", not "2 gals". */
const ABBREVIATIONS = new Set([
  "gal",
  "ft",
  "sq ft",
  "cu ft",
  "oz",
  "lb",
  "lbs",
  "in",
  "qt",
  "pt",
  "yd",
  "cu yd",
  "kg",
  "g",
  "l",
  "ml",
  "m",
]);

export function plural(unit: string): string {
  if (
    unit === "" ||
    ABBREVIATIONS.has(unit.toLowerCase()) ||
    unit.endsWith("s")
  )
    return unit;
  if (unit.endsWith("y")) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}

export function timeAgo(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** YYYY-MM-DD in local time (the server's TZ, or the phone's) — not UTC, which is tomorrow by evening. */
export function localDay(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}
