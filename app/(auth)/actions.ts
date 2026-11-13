"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ValidationError } from "@/lib/core/types";
import { redeemInvite } from "@/lib/auth/invites";
import { signInOptions } from "@/lib/auth/oidc";
import { verifyPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/redirects";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  revokeSession,
} from "@/lib/auth/sessions";
import {
  createFirstAdmin,
  findUserByEmail,
  needsSetup,
} from "@/lib/auth/users";
import { loginLimiter } from "@/lib/web/limits";
import { clientIp } from "@/lib/web/client-ip";
import { formValues, raw, refusalMessage, text } from "@/lib/web/fields";
import { z } from "zod";

export type FormState = { error?: string };

async function requestMeta() {
  const h = await headers();
  return { userAgent: h.get("user-agent"), ip: clientIp(h) };
}

async function startSession(userId: string) {
  const session = await createSession(userId, await requestMeta());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, cookieOptions);
}

/*
 * These start or end a session, so they can't take one first (act() does,
 * lib/web/action.ts). They parse with zod before anything else is awaited
 * instead. The caps keep argon2 from being handed a megabyte; what makes an
 * address or a password acceptable stays in lib/auth/.
 */
const setupForm = z.object({
  email: text(320),
  displayName: text(200),
  password: raw(1_000),
  homeName: text(200),
});

const loginForm = z.object({
  email: text(320),
  password: raw(1_000),
  /* Room for a whole /oauth/authorize URL, which is carried in `next`; safeNext
     drops anything longer rather than refusing the sign-in. */
  next: text(1_000_000),
});

/* The link token: base64url, as generateToken makes it. */
const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{16,200}$/);
const joinForm = z.object({
  email: text(320),
  displayName: text(200),
  password: raw(1_000),
});

export async function setupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setupForm.safeParse(formValues(formData));
  if (!parsed.success) return { error: refusalMessage(parsed.error) };
  try {
    const user = await createFirstAdmin(parsed.data);
    await startSession(user.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  // Outside the try: redirect() signals by throwing.
  redirect("/");
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginForm.safeParse(formValues(formData));
  if (!parsed.success) return { error: refusalMessage(parsed.error) };
  const { email, password } = parsed.data;
  /* Validated rather than used: the one string a visitor supplies that decides
     where a browser goes afterwards (lib/auth/redirects.ts). */
  const next = safeNext(parsed.data.next || undefined);

  if (await needsSetup()) redirect("/setup");

  // The app is on the internet; a password form without a limit is a target.
  const { ip } = await requestMeta();
  if (
    !loginLimiter.take(`ip:${ip ?? "unknown"}`) ||
    !loginLimiter.take(`email:${email.trim().toLowerCase()}`)
  ) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  /* OIDC_ONLY is enforced here, not by hiding the form: a post does not need the form. */
  const options = await signInOptions();
  if (!options.password)
    return { error: `Sign in with ${options.sso?.name ?? "single sign-on"}.` };

  const user = await findUserByEmail(email);
  /* Verify even when the address is unknown, against a hash that cannot match,
     so "no such user" is not measurably faster than "wrong password". */
  const storedHash =
    user?.passwordHash ??
    "$argon2id$v=19$m=19456,t=2,p=1$aG9tZWRvY3MtZHVtbXktc2FsdA$0000000000000000000000000000000000000000000";
  const ok = await verifyPassword(storedHash, password);
  if (!user || !ok) return { error: "That email and password do not match." };

  await startSession(user.id);
  redirect(next);
}

export async function joinAction(
  token: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ token: inviteToken, form: joinForm })
    .safeParse({ token, form: formValues(formData) });
  if (!parsed.success) {
    /* A link that isn't one is said as such; a field is refused in its own words. */
    const badLink = parsed.error.issues.some(
      (issue) => issue.path[0] === "token",
    );
    return {
      error: badLink
        ? "This link has expired or was already used. Ask for a new one."
        : refusalMessage(parsed.error),
    };
  }
  try {
    const user = await redeemInvite(parsed.data.token, parsed.data.form);
    await startSession(user.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  redirect("/");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  /* Its only input is the cookie. One of no sane length is dropped without a lookup. */
  if (token && token.length <= 512) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
