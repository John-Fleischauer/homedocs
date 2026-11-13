/*
 * "Is this visitor at the house?" — the location gate for codes on the guide.
 *
 * At home means the client address (lib/web/client-ip.ts, which only trusts
 * what our own proxy appended) is inside one of the property's LAN ranges, or
 * equals the home's public address, found by resolving its DDNS hostname. The
 * second covers a phone on the home Wi-Fi reaching the public hostname through
 * the router (hairpin NAT), which is how most housesitters will arrive.
 *
 * It is a convenience, not the only lock: away from home the link's PIN opens
 * the same content. Browser geolocation is deliberately not used — it is
 * asserted by the client, so it would be trivially forged.
 */

import { resolve4, resolve6 } from "node:dns/promises";
import { processMap } from "../process-state";
import { ipInAny, parseIp } from "./networks";

const TTL_MS = 5 * 60 * 1000;
const resolved = processMap<{ at: number; addresses: string[] }>(
  "home-hostname",
);

export async function homeAddresses(
  hostname: string,
  now = Date.now(),
): Promise<string[]> {
  if (!hostname) return [];
  const cached = resolved.get(hostname);
  if (cached && now - cached.at < TTL_MS) return cached.addresses;
  const [v4, v6] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
  ]);
  const addresses = [...v4, ...v6];
  // A failed lookup is cached too, briefly, so a DNS outage does not slow every view.
  resolved.set(hostname, {
    at: addresses.length ? now : now - TTL_MS + 30_000,
    addresses,
  });
  return addresses;
}

export async function isAtHome(
  ip: string | null,
  property: { homeNetworks: string[]; homeHostname: string },
  lookup: (host: string) => Promise<string[]> = homeAddresses,
): Promise<boolean> {
  if (!ip || !parseIp(ip)) return false;
  if (ipInAny(ip, property.homeNetworks)) return true;
  const wan = await lookup(property.homeHostname);
  return wan.length > 0 && ipInAny(ip, wan);
}
