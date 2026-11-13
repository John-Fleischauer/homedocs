/*
 * What a server action can be sent, as zod schemas.
 *
 * `act()` (lib/web/action.ts) turns a FormData into a plain object first
 * (`formValues`): one value per name, or an array when the form repeats a
 * name. These schemas take that object field by field. They check the shape
 * only: that an id is an id, that a kind is one of the kinds, that text is not
 * a file or a megabyte. Whether a name is free or a part fits a fixture stays
 * with the domain modules in lib/<area>/, which say so in their own words.
 *
 * The forms are the app's own, so input that fails here was tampered with or
 * sent by a page older than the code. The messages say what to do about that.
 */

import { z } from "zod";

/**
 * Name/value pairs (a FormData) as a plain object for zod: one value per name,
 * or an array when a name repeats. Own keys only, so a name like `constructor`
 * or `__proto__` is just a name.
 */
export function collect<V>(
  entries: Iterable<[string, V]>,
  skip?: (name: string) => boolean,
): Record<string, V | V[]> {
  const out: Record<string, V | V[]> = {};
  for (const [name, value] of entries) {
    if (skip?.(name)) continue;
    if (!Object.hasOwn(out, name)) {
      Object.defineProperty(out, name, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      continue;
    }
    const existing = out[name]!;
    out[name] = Array.isArray(existing)
      ? [...existing, value]
      : [existing, value];
  }
  return out;
}

/**
 * A FormData as a plain object for zod (`collect`). Files stay File objects, so
 * a text field sent a file fails its schema. Next's own `$ACTION_` fields are
 * left out.
 */
export function formValues(
  formData: FormData,
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  return collect(formData.entries(), (name) => name.startsWith("$ACTION_"));
}

/**
 * A form plus the arguments its action was bound with (`action.bind(null, id)`),
 * as one object for one schema. The bound arguments win over a form field of the
 * same name: they say which record, and the form only says what to change.
 */
export function withForm(
  formData: FormData,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = formValues(formData);
  for (const [name, value] of Object.entries(args)) {
    Object.defineProperty(out, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

/** A refusal's message: each issue's once, as a form shows it. */
export function refusalMessage(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join(" ");
}

export const RELOAD =
  "Something went wrong reading the form. Reload and try again.";
export const GONE = "That no longer exists. Reload and try again.";

/* Far more than anyone types into one box, well under Next's 1MB action body
   limit. A how-to or a note body is the longest thing a form sends. */
const MAX_TEXT = 100_000;

/* A form that repeats a name sends an array; a single field reads the first
   value, as `formData.get` did. */
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/* A name the form sent any number of times, as a list. */
const list = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const tooLong = (max: number) =>
  `That is too long: ${max.toLocaleString("en-US")} characters at most.`;

/** A text field, trimmed; '' when the form did not send it. */
export function text(max = MAX_TEXT) {
  return z
    .preprocess(
      first,
      z
        .string({ error: RELOAD })
        .trim()
        .max(max, { error: tooLong(max) })
        .optional(),
    )
    .transform((value) => value ?? "");
}

/** Text whose spacing is its own (a password): not trimmed. */
export function raw(max = MAX_TEXT) {
  return z
    .preprocess(
      first,
      z
        .string({ error: RELOAD })
        .max(max, { error: tooLong(max) })
        .optional(),
    )
    .transform((value) => value ?? "");
}

/** Text that is undefined when the form did not send the field at all ('' when it sent it empty). */
export function sentText(max = MAX_TEXT) {
  return z.preprocess(
    first,
    z
      .string({ error: RELOAD })
      .trim()
      .max(max, { error: tooLong(max) })
      .optional(),
  );
}

const uuid = z
  .string({ error: GONE })
  .trim()
  .pipe(z.guid({ error: GONE }));

/** The id of a row of ours. */
export function id() {
  return z.preprocess(first, uuid);
}

/** An id, or null when the field is empty or not sent. */
export function optionalId() {
  return z
    .preprocess((value) => {
      const one = first(value);
      return typeof one === "string" && one.trim() === "" ? undefined : one;
    }, uuid.optional())
    .transform((value) => value ?? null);
}

/**
 * An id, null when the field is sent empty, undefined when it is not sent at
 * all: for a form that leaves a field out to mean "don't change it".
 */
export function keptId() {
  return z.preprocess((value) => {
    const one = first(value);
    return typeof one === "string" && one.trim() === "" ? null : one;
  }, uuid.nullable().optional());
}

/** Every value sent under a name, trimmed, empty ones left out. */
export function many(max = 1_000) {
  return z
    .preprocess(
      list,
      z
        .array(
          z
            .string({ error: RELOAD })
            .trim()
            .max(MAX_TEXT, { error: tooLong(MAX_TEXT) }),
          { error: RELOAD },
        )
        .max(max, { error: RELOAD }),
    )
    .transform((values) => values.filter(Boolean));
}

/** Every value sent under a name, as sent (untrimmed, empty ones kept): for lists read in step with another list. */
export function each(max = 1_000) {
  return z.preprocess(
    list,
    z
      .array(
        z.string({ error: RELOAD }).max(MAX_TEXT, { error: tooLong(MAX_TEXT) }),
        { error: RELOAD },
      )
      .max(max, { error: RELOAD }),
  );
}

/** Every id sent under a name, empty ones left out. */
export function ids(max = 1_000) {
  return z.preprocess(
    (value) =>
      list(value).filter(
        (one) => !(typeof one === "string" && one.trim() === ""),
      ),
    z.array(uuid, { error: RELOAD }).max(max, { error: RELOAD }),
  );
}

/** A checkbox, or a hidden field that says yes: true only for "on", "1" or "true". */
export function checked() {
  return z.preprocess((value) => {
    const one = first(value);
    return one === "on" || one === "1" || one === "true";
  }, z.boolean());
}

/** A yes/no a client passes as an argument. */
export function bool() {
  return z.boolean({ error: RELOAD });
}

/** One of a fixed set of values, refused with `message` otherwise. */
export function oneOf<const T extends readonly [string, ...string[]]>(
  values: T,
  message = RELOAD,
) {
  return z.preprocess(
    (value) => {
      const one = first(value);
      return typeof one === "string" ? one.trim() : one;
    },
    z.enum(values, { error: message }),
  );
}

/** A whole number within bounds, from a text field or an argument; `fallback` when empty or not sent. */
export function int(
  min: number,
  max: number,
  message: string,
  fallback?: number,
) {
  return z.preprocess(
    (value) => {
      const one = first(value);
      if (typeof one === "number") return one;
      if (one === undefined || (typeof one === "string" && one.trim() === ""))
        return fallback;
      return typeof one === "string" ? Number(one.trim()) : one;
    },
    z
      .number({ error: message })
      .int({ error: message })
      .min(min, { error: message })
      .max(max, { error: message }),
  );
}

/**
 * A timestamp a form carried back (`updatedAt`, a "seen at"), for optimistic
 * concurrency: undefined when empty or not sent. One that doesn't parse is
 * refused rather than dropped, since dropping it would skip the stale check.
 */
export function timestamp() {
  return text(64).transform((value, ctx) => {
    if (value === "") return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: RELOAD });
      return z.NEVER;
    }
    return date;
  });
}

/**
 * A path inside the app to go back to. Printable ASCII with no spaces or
 * backslashes (a browser drops tabs and newlines and reads `\` as `/`, which
 * would turn `/\t/elsewhere` into `//elsewhere`), starting with one slash, and
 * resolving to this origin.
 */
export function localPath() {
  return text(2_000).refine(
    (value) =>
      /^\/[\x21-\x7e]*$/.test(value) &&
      !value.includes("\\") &&
      !value.startsWith("//") &&
      sameOrigin(value),
    { error: RELOAD },
  );
}

function sameOrigin(path: string): boolean {
  try {
    return new URL(path, "http://app.invalid").origin === "http://app.invalid";
  } catch {
    return false;
  }
}

/** A field that carries JSON, parsed and then checked against `schema`. */
export function json<S extends z.ZodType>(schema: S, max = 500_000) {
  return raw(max)
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: RELOAD });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

/**
 * One parameter of a query or form-encoded body read with `collect`: text, sent
 * at most once (a repeat is an array, refused), at most 4 KB. For the OAuth and
 * sign-on parameters, where a repeated `state` or `code` is a malformed request.
 */
export function queryParam(messages: { once?: string; long?: string } = {}) {
  return z
    .string({ error: messages.once ?? RELOAD })
    .max(4_096, { error: messages.long ?? RELOAD })
    .optional();
}
