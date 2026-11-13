/*
 * The client's address, as far as it can be trusted.
 *
 * Next gives a Route Handler no socket address, so the only source is headers,
 * and a client can send any headers it likes. What it cannot do is control what
 * the proxy *appends*: each proxy adds the address it received the connection
 * from to the right of X-Forwarded-For. With N proxies in front of the app
 * (TRUSTED_PROXY_HOPS, default 1), the Nth entry from the right was written by
 * our outermost proxy and is the real client; everything to its left is
 * whatever the client claimed, and is ignored.
 *
 * Or CLIENT_IP_HEADER names one header to read instead, which is only safe when
 * the proxy in front overwrites that header on every request, so a client
 * cannot choose its value (production: x-real-ip; docs/DEPLOYMENT.md).
 *
 * This decides whether the house guide treats a visitor as "at home"
 * (lib/guide/location.ts), so the hop count must match the deployment. If the
 * app port is also reachable directly on the LAN, a LAN client can forge the
 * header — but a LAN client *is* at home, so nothing is gained.
 */

type HeaderBag = { get(name: string): string | null };

export function clientIp(
  headers: HeaderBag,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const special = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (special) return headers.get(special)?.trim() || null;

  const hops = Math.max(
    1,
    Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1,
  );
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length >= hops) return chain[chain.length - hops]!;
  // Fewer entries than proxies: the request did not come through them all.
  return headers.get("x-real-ip")?.trim() || null;
}
