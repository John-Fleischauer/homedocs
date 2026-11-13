/*
 * Files on disk, by content hash: DATA_DIR/files/<sha[0:2]>/<sha>.
 *
 * Photos are primary data here — there is no other copy of the picture of the
 * breaker panel — so the volume is part of the backup (docs/DEPLOYMENT.md).
 *
 * Images are re-encoded on the way in, which does three jobs: EXIF orientation
 * is applied and then all metadata is dropped (a guide photo must not carry the
 * house's GPS coordinates), the long edge is capped, and whatever arrived is
 * proven to be an image rather than trusted by its Content-Type. The hash is of
 * the stored bytes, so it identifies what is actually on disk.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import { ValidationError } from "../core/types";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_EDGE = 2560;
export const THUMB_EDGE = 640;

/** What may be uploaded. SVG is refused: it is a document that can carry script. */
export const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);
export const DOCUMENT_TYPES = new Set(["application/pdf"]);

export function dataDir(): string {
  return process.env.DATA_DIR || join(process.cwd(), "data");
}

function pathFor(sha: string, variant = ""): string {
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error("bad file id");
  return join(
    dataDir(),
    "files",
    sha.slice(0, 2),
    variant ? `${sha}-${variant}` : sha,
  );
}

async function writeAtomic(path: string, bytes: Buffer) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
}

export type Stored = {
  sha256: string;
  mime: string;
  byteSize: number;
  width: number | null;
  height: number | null;
};

export async function storeUpload(
  bytes: Buffer,
  declaredMime: string,
): Promise<Stored> {
  if (bytes.byteLength === 0) throw new ValidationError("That file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new ValidationError("That file is too big (25 MB at most).");

  if (DOCUMENT_TYPES.has(declaredMime)) {
    // Proven by its magic bytes, not by what the browser said.
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-")
      throw new ValidationError("That isn’t a PDF.");
    return save(bytes, "application/pdf", null, null);
  }

  if (!IMAGE_TYPES.has(declaredMime))
    throw new ValidationError("Upload a photo or a PDF.");

  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(bytes, { failOn: "error" })
      .rotate() // apply EXIF orientation, before metadata is dropped
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ValidationError(
      declaredMime.includes("hei")
        ? "That photo format couldn’t be read here. Try taking the photo from the camera button instead."
        : "That photo couldn’t be read. Try another one.",
    );
  }
  return save(out.data, "image/jpeg", out.info.width, out.info.height);
}

async function save(
  bytes: Buffer,
  mime: string,
  width: number | null,
  height: number | null,
): Promise<Stored> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = pathFor(sha256);
  // Same bytes, same file: an identical upload costs nothing.
  if (!(await exists(path))) await writeAtomic(path, bytes);
  return { sha256, mime, byteSize: bytes.byteLength, width, height };
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readStored(sha: string): Promise<Buffer> {
  return readFile(pathFor(sha));
}

/** A small JPEG for lists, made on first ask and kept beside the original. */
export async function readThumb(sha: string): Promise<Buffer> {
  const path = pathFor(sha, `t${THUMB_EDGE}.jpg`);
  try {
    return await readFile(path);
  } catch {
    const thumb = await sharp(await readStored(sha))
      .resize({
        width: THUMB_EDGE,
        height: THUMB_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78 })
      .toBuffer();
    await writeAtomic(path, thumb);
    return thumb;
  }
}

export { pathFor as filePath };
