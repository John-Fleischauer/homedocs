/*
 * The shape every server action shares.
 *
 * A server action is a public endpoint whatever page it is called from: the
 * (app) layout's guard covers the page, not a POST to the action's id. So each
 * one authenticates here, then parses what it was sent with zod before anything
 * else reads it (the standards' security.md, "Validate at every trust boundary").
 *
 * A refusal the domain layer can explain (an `AppError`) goes back as `error`
 * for the form to show, in the domain's own words. Anything else is a fault: it
 * is logged in full and the person sees FAILED. In production React would
 * replace a thrown message with "Minified React error" anyway, so rethrowing it
 * helped nobody.
 */

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { AppError } from "../core/types";
import { viewer, type Viewer } from "./context";
import { GONE, formValues, refusalMessage } from "./fields";

export type ActionResult = {
  error?: string;
  ok?: boolean;
  id?: string;
  message?: string;
};

export const FAILED = "Something went wrong. Try again.";

/**
 * Run a server action: authenticate, parse `input` with `schema`, then `work`.
 *
 *   export async function renameAction(id: string, _: ActionResult, fd: FormData) {
 *     return act(withForm(fd, { id }), z.object({ id: id(), name: text() }), async (input, { scope, actor }) => { ... })
 *   }
 *
 * - The session comes first: nobody signed out gets as far as the parse
 *   (`viewer()` redirects them to sign in).
 * - `input` is a FormData (read with `formValues`), a form with its bound
 *   arguments (`withForm`), or plain values for the actions a client calls with
 *   arguments. What does not parse is refused with the schema's messages,
 *   before `work` sees it.
 * - An `AppError` from `work` comes back as its message. An id that is not a
 *   uuid never matched anything, so it reads as gone. Anything else is logged
 *   and comes back as FAILED.
 * - `redirect()` and `notFound()` work by throwing; `unstable_rethrow` lets
 *   them through before any of that.
 */
export async function act<S extends z.ZodType>(
  input: unknown,
  schema: S,
  work: (
    data: z.output<S>,
    v: Viewer,
  ) => Promise<void | Omit<ActionResult, "error">>,
): Promise<ActionResult> {
  let done: void | Omit<ActionResult, "error">;
  try {
    /* First, before the parse. Signed out, it redirects (let through below). */
    const v = await viewer();
    const parsed = schema.safeParse(
      input instanceof FormData ? formValues(input) : input,
    );
    if (!parsed.success) return { error: refusalMessage(parsed.error) };
    done = await work(parsed.data, v);
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) return { error: err.message };
    if (isInvalidUuid(err)) {
      /* Logged too: an id that got past its schema is a gap worth seeing. */
      console.warn(
        "[action] refused a malformed uuid:",
        err instanceof Error ? err.message : err,
      );
      return { error: GONE };
    }
    console.error("[action] failed:", err);
    return { error: FAILED };
  }
  // Small pages and a handful of users: refreshing everything is simpler than
  // tracking which lists a record appears in.
  revalidatePath("/", "layout");
  return { ok: true, ...(done ?? {}) };
}

/* 22P02 is invalid_text_representation. Only the uuid case reads as gone (a
   uuid column compared with something that is not one); a bad integer, enum or
   json literal is a bug and stays a logged failure. Drizzle wraps the driver's
   error, so the code can be a cause or two down. */
function isInvalidUuid(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: string }).code;
    if (code === "22P02" && /type uuid/.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
