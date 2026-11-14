/*
 * Where a part is bought: the stores on a part, and the retailers the app knows
 * by sight.
 *
 * A part keeps a short list of stores (`supplies.stores`): the retailer, a link
 * to the product if there is one, and whether it is bought in the store, online
 * or either. The retailer is the family's own words; a known one is recognised
 * by name or by the link's host and shown with its colours and a monogram. The
 * badges are drawn here, not fetched: nothing is asked of the retailer's site,
 * and nothing about the house leaves it to show a store's icon.
 *
 * Pure: the form uses it in the browser to show the badge as you type.
 */

export const HOW = ["in_store", "online", "either"] as const;
export type How = (typeof HOW)[number];

export const HOW_LABEL: Record<How, string> = {
  in_store: "In store",
  online: "Online",
  either: "In store or online",
};

export function isHow(value: unknown): value is How {
  return (
    typeof value === "string" && (HOW as readonly string[]).includes(value)
  );
}

export type StoreLink = {
  /** "Home Depot", "Ace on Main St". Filled from the link when left blank and the store is known. */
  retailer: string;
  url: string;
  how: How;
};

export type Retailer = {
  key: string;
  name: string;
  /** Other ways people write it, lower case, no punctuation. */
  aliases?: string[];
  /** Hosts it sells from; subdomains match too. */
  hosts: string[];
  /** Badge colours: the store's own, each pair at least 4.5:1 (test/retailers.test.ts). */
  bg: string;
  fg: string;
  mark: string;
};

export const RETAILERS: Retailer[] = [
  {
    key: "home-depot",
    name: "Home Depot",
    aliases: ["the home depot", "homedepot", "hd"],
    hosts: ["homedepot.com", "homedepot.ca"],
    bg: "#f96302",
    fg: "#000000",
    mark: "HD",
  },
  {
    key: "lowes",
    name: "Lowe’s",
    aliases: ["lowes"],
    hosts: ["lowes.com", "lowes.ca"],
    bg: "#004990",
    fg: "#ffffff",
    mark: "L",
  },
  {
    key: "amazon",
    name: "Amazon",
    hosts: [
      "amazon.com",
      "amazon.ca",
      "amazon.co.uk",
      "amzn.to",
      "a.co",
      "amzn.com",
    ],
    bg: "#232f3e",
    fg: "#ff9900",
    mark: "a",
  },
  {
    key: "walmart",
    name: "Walmart",
    hosts: ["walmart.com", "walmart.ca"],
    bg: "#0053e2",
    fg: "#ffffff",
    mark: "W",
  },
  {
    key: "target",
    name: "Target",
    hosts: ["target.com"],
    bg: "#cc0000",
    fg: "#ffffff",
    mark: "T",
  },
  {
    key: "costco",
    name: "Costco",
    hosts: ["costco.com", "costco.ca"],
    bg: "#005daa",
    fg: "#ffffff",
    mark: "C",
  },
  {
    key: "sams-club",
    name: "Sam’s Club",
    aliases: ["sams club", "sams"],
    hosts: ["samsclub.com"],
    bg: "#0067a0",
    fg: "#ffffff",
    mark: "S",
  },
  {
    key: "ace",
    name: "Ace Hardware",
    aliases: ["ace"],
    hosts: ["acehardware.com"],
    bg: "#d40029",
    fg: "#ffffff",
    mark: "Ace",
  },
  {
    key: "menards",
    name: "Menards",
    hosts: ["menards.com"],
    bg: "#00703c",
    fg: "#ffffff",
    mark: "M",
  },
  {
    key: "sherwin-williams",
    name: "Sherwin-Williams",
    aliases: ["sherwin williams", "sw"],
    hosts: ["sherwin-williams.com"],
    bg: "#0a4a8f",
    fg: "#ffffff",
    mark: "SW",
  },
  {
    key: "benjamin-moore",
    name: "Benjamin Moore",
    aliases: ["bm"],
    hosts: ["benjaminmoore.com"],
    bg: "#c8102e",
    fg: "#ffffff",
    mark: "BM",
  },
  {
    key: "best-buy",
    name: "Best Buy",
    aliases: ["bestbuy"],
    hosts: ["bestbuy.com", "bestbuy.ca"],
    bg: "#0046be",
    fg: "#fff200",
    mark: "BB",
  },
  {
    key: "tractor-supply",
    name: "Tractor Supply",
    aliases: ["tsc"],
    hosts: ["tractorsupply.com"],
    bg: "#b5121b",
    fg: "#ffffff",
    mark: "TSC",
  },
  {
    key: "harbor-freight",
    name: "Harbor Freight",
    hosts: ["harborfreight.com"],
    bg: "#c8102e",
    fg: "#ffffff",
    mark: "HF",
  },
  {
    key: "batteries-plus",
    name: "Batteries Plus",
    hosts: ["batteriesplus.com"],
    bg: "#0b3b74",
    fg: "#ffffff",
    mark: "B+",
  },
  {
    key: "wayfair",
    name: "Wayfair",
    hosts: ["wayfair.com"],
    bg: "#7f187f",
    fg: "#ffffff",
    mark: "W",
  },
  {
    key: "ebay",
    name: "eBay",
    hosts: ["ebay.com"],
    bg: "#0064d2",
    fg: "#ffffff",
    mark: "e",
  },
];

/* "Lowe's", "lowes", "LOWE’S" → "lowes". */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

const BY_NAME = new Map<string, Retailer>();
for (const r of RETAILERS)
  for (const n of [r.name, ...(r.aliases ?? [])]) BY_NAME.set(plain(n), r);

/** The link's host, without "www.": "homedepot.com". Empty when it isn't a link. */
export function hostOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function byHost(host: string): Retailer | undefined {
  if (!host) return undefined;
  return RETAILERS.find((r) =>
    r.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
  );
}

/** The known retailer a store is, by what the family called it or else by its link. */
export function knownRetailer(
  store: Pick<StoreLink, "retailer" | "url">,
): Retailer | undefined {
  return BY_NAME.get(plain(store.retailer)) ?? byHost(hostOf(store.url));
}

/** What to call a store: its own name, else the known retailer's, else the link's host. */
export function storeName(store: Pick<StoreLink, "retailer" | "url">): string {
  return (
    store.retailer.trim() || knownRetailer(store)?.name || hostOf(store.url)
  );
}

export type Badge = { bg?: string; fg?: string; mark: string };

/** The badge for a store: a known retailer's colours, or the first letter of its name in the app's own. */
export function badgeFor(store: Pick<StoreLink, "retailer" | "url">): Badge {
  const known = knownRetailer(store);
  if (known) return { bg: known.bg, fg: known.fg, mark: known.mark };
  const name = storeName(store);
  const letter = name.match(/[\p{L}\p{N}]/u)?.[0];
  return { mark: letter ? letter.toUpperCase() : "" };
}
