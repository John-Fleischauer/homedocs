/*
 * Sealed values: AES-256-GCM under INTEGRATIONS_KEY.
 *
 * For Wi-Fi passwords, alarm codes and (later) integration tokens. The key is
 * deliberately NOT SESSION_SECRET: rotating that one signs everyone out, and
 * must not also make every stored code unreadable.
 *
 * Format: v1.<keyId>.<iv>.<tag>.<ciphertext>, base64url parts. `keyId` is a
 * short fingerprint of the key, so a value sealed under a different key is
 * recognised as such ("enter it again") rather than failing as corrupt.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { MIN_SECRET_LENGTH } from "../secret-length";

export class SealedError extends Error {}

function key(): { key: Buffer; id: string } {
  const raw = process.env.INTEGRATIONS_KEY ?? "";
  if (raw.length < MIN_SECRET_LENGTH) {
    throw new SealedError(
      `INTEGRATIONS_KEY must be set (${MIN_SECRET_LENGTH}+ characters).`,
    );
  }
  const k = createHash("sha256").update(`homedocs:sealed:v1:${raw}`).digest();
  const id = createHash("sha256").update(k).digest("base64url").slice(0, 8);
  return { key: k, id };
}

export function seal(plaintext: string): string {
  const { key: k, id } = key();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    id,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function unseal(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 5 || parts[0] !== "v1")
    throw new SealedError("Unreadable value. Enter it again.");
  const { key: k, id } = key();
  if (parts[1] !== id)
    throw new SealedError(
      "This was saved with a different key. Enter it again.",
    );
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      k,
      Buffer.from(parts[2]!, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(parts[3]!, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4]!, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SealedError("Unreadable value. Enter it again.");
  }
}

/** Unseal, or the reason it failed — for pages that should degrade, not crash. */
export function tryUnseal(
  sealed: string,
): { value: string } | { error: string } {
  try {
    return { value: unseal(sealed) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unreadable value." };
  }
}
