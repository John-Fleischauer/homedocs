"use client";

/*
 * Add a photo (or PDF) to a record.
 *
 * Photos are shrunk in the browser before upload — a 12-megapixel phone photo
 * becomes a ~2560px JPEG of a few hundred KB. That keeps uploads quick on a
 * phone, and it also turns an iPhone's HEIC into a JPEG, which the server's
 * image library may not be able to read. The server re-encodes anyway and drops
 * all metadata, including GPS.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { buttonClass } from "./ui/Button";
import { Icon } from "./ui/icons";

const MAX_EDGE = 2560;

async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    return blob ?? file;
  } catch {
    // The browser could not decode it; let the server try.
    return file;
  }
}

/**
 * `tile` is the large empty-state version, for a record whose photo is the
 * point of it (where the water shutoff is). On a phone it offers the camera.
 */
export function PhotoUpload({
  owner,
  label = "Add Photo",
  tile,
}: {
  owner: string;
  label?: string;
  tile?: { title: string; hint: string };
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const body = new FormData();
        const shrunk = await shrink(file);
        const name =
          shrunk === file
            ? file.name
            : file.name.replace(/\.\w+$/, "") + ".jpg";
        body.append("file", shrunk, name);
        const res = await fetch(
          `/api/files?owner=${encodeURIComponent(owner)}`,
          { method: "POST", body },
        );
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(json.error ?? "Couldn’t upload. Try again.");
        }
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn’t upload. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={onChange}
        aria-label={label}
      />
      {tile ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex min-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line bg-card px-4 py-6 text-center hover:bg-sunk disabled:opacity-60"
        >
          <Icon name="camera" className="h-8 w-8 text-accent" />
          <span className="text-[15px] font-medium text-ink">
            {busy ? "Uploading…" : tile.title}
          </span>
          <span className="text-sm text-ink-3">{tile.hint}</span>
        </button>
      ) : (
        <button
          type="button"
          className={buttonClass("secondary")}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Icon name="camera" />
          {busy ? "Uploading…" : label}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
