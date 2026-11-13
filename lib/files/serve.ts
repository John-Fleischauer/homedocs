import { readStored, readThumb } from "./store";

/** The response for a stored file: right type, no sniffing, cached privately. */
export async function fileResponse(
  sha: string,
  meta: { mime: string; originalName: string },
  thumb: boolean,
  cache = "private, max-age=31536000, immutable",
): Promise<Response> {
  try {
    const isImage = meta.mime.startsWith("image/");
    const bytes =
      thumb && isImage ? await readThumb(sha) : await readStored(sha);
    const name = (
      meta.originalName || (isImage ? "photo.jpg" : "file.pdf")
    ).replace(/[^\w.\- ]/g, "_");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": thumb && isImage ? "image/jpeg" : meta.mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${name}"`,
        // A PDF opened in the tab is still our origin; keep it from running anything.
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
