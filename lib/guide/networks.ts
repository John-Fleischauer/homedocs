/*
 * CIDR parsing and matching for the guide's "at home" check.
 *
 * Small and dependency-free on purpose: this decides whether alarm codes are
 * shown without a PIN, so every line of it should be readable in review.
 * IPv4 and IPv6 both; an IPv4-mapped IPv6 address (::ffff:192.168.1.5) is
 * treated as the IPv4 address it carries.
 */

import { isIP } from "node:net";

type Parsed = { version: 4 | 6; bytes: number[] };

function v4Bytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null;
}

function v6Bytes(ip: string): number[] | null {
  let text = ip.toLowerCase();
  // Zone ids (fe80::1%eth0) carry no address bits.
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // A trailing dotted quad (::ffff:1.2.3.4) is two groups.
  const lastColon = text.lastIndexOf(":");
  let tail: number[] = [];
  if (text.includes(".", lastColon)) {
    const v4 = v4Bytes(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    text = text.slice(0, lastColon + 1) + "0:0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
  const all = [
    ...head,
    ...Array(halves.length === 2 ? fill : 0).fill("0"),
    ...rest,
  ];
  const bytes: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

export function parseIp(raw: string): Parsed | null {
  const ip = raw.trim().replace(/^\[|\]$/g, "");
  const version = isIP(ip);
  if (version === 4) {
    const bytes = v4Bytes(ip);
    return bytes ? { version: 4, bytes } : null;
  }
  if (version === 6) {
    const bytes = v6Bytes(ip);
    if (!bytes) return null;
    // IPv4-mapped: compare as IPv4.
    if (
      bytes.slice(0, 10).every((b) => b === 0) &&
      bytes[10] === 0xff &&
      bytes[11] === 0xff
    ) {
      return { version: 4, bytes: bytes.slice(12) };
    }
    return { version: 6, bytes };
  }
  return null;
}

export type Cidr = { version: 4 | 6; bytes: number[]; prefix: number };

export function parseCidr(raw: string): Cidr | null {
  const [addr, prefixText] = raw.trim().split("/");
  const ip = parseIp(addr ?? "");
  if (!ip) return null;
  const max = ip.version === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? max : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null;
  return { ...ip, prefix };
}

export function inCidr(ip: Parsed, cidr: Cidr): boolean {
  if (ip.version !== cidr.version) return false;
  let bits = cidr.prefix;
  for (let i = 0; bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((ip.bytes[i]! & mask) !== (cidr.bytes[i]! & mask)) return false;
  }
  return true;
}

/** Split a free-text list (commas, spaces, new lines) into valid CIDRs and the rest. */
export function parseNetworks(text: string): {
  networks: string[];
  invalid: string[];
} {
  const networks: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    if (parseCidr(part)) networks.push(part);
    else invalid.push(part);
  }
  return { networks, invalid };
}

export function ipInAny(ip: string, cidrs: readonly string[]): boolean {
  const parsed = parseIp(ip);
  if (!parsed) return false;
  return cidrs.some((c) => {
    const cidr = parseCidr(c);
    return cidr ? inCidr(parsed, cidr) : false;
  });
}
