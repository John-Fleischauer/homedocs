/*
 * Reading a request body with a cap: the OAuth endpoints, which take one
 * before anyone is authenticated, and the file upload.
 *
 * A route handler gets no body limit from Next (the proxy's and server
 * actions' limits don't apply to it), so `request.text()` would buffer
 * whatever arrived. Each route says how much it takes (the standards'
 * security.md: size limits are per route):
 *
 * - A `Content-Length` over the cap is refused (413) before anything is read.
 * - `requireLength` refuses a body with no `Content-Length` (411), for a
 *   route that should never be sent one chunked.
 * - Whatever the header said, reading stops at the cap (413), so a body sent
 *   chunked, with no length, is held to it too.
 */

export type BodyRead =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 411 | 413; error: string };

export async function readBody(
  request: Request,
  options: { max: number; requireLength?: boolean },
): Promise<BodyRead> {
  const read = await readBytes(request, options);
  return read.ok ? { ok: true, text: read.bytes.toString("utf8") } : read;
}

export type BytesRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; status: 400 | 411 | 413; error: string };

/** As `readBody`, keeping the bytes as they came: for an upload, which isn't text. */
export async function readBytes(
  request: Request,
  options: { max: number; requireLength?: boolean },
): Promise<BytesRead> {
  const tooLarge: BytesRead = {
    ok: false,
    status: 413,
    error: `The body is over ${options.max} bytes.`,
  };

  const declared = request.headers.get("content-length");
  if (declared === null) {
    if (options.requireLength)
      return { ok: false, status: 411, error: "A Content-Length is required." };
  } else {
    if (!/^\d{1,15}$/.test(declared.trim()))
      return {
        ok: false,
        status: 400,
        error: "The Content-Length is not a number.",
      };
    if (Number(declared) > options.max) return tooLarge;
  }

  if (!request.body) return { ok: true, bytes: Buffer.alloc(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > options.max) {
        await reader.cancel();
        return tooLarge;
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "The body could not be read." };
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}
