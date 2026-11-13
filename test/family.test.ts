/*
 * Adding someone from the Family page without an invite link, mostly for
 * Pocket ID: the account waits with no password, and their first sign-on
 * with that address links to it with the role the admin picked.
 */

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { resolveOidcAccount } from "../lib/auth/oidc-accounts";
import { addFamilyMember, removeUser } from "../lib/auth/users";
import { users } from "../lib/db/schema";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

resetBetweenTests();

const ISSUER = "https://id.example.test";
const claims = (email: string, verified = true, subject = "sub-1") => ({
  issuer: ISSUER,
  subject,
  email,
  emailVerified: verified,
  name: "Whatever Pocket ID says",
});
const options = { trustEmail: false, defaultRole: "viewer" as const };

describe("adding someone directly", () => {
  it("makes an account with no password that their first sign-on links to", async () => {
    const { admin } = await household();
    const added = await addFamilyMember(
      {
        displayName: "Grandma",
        email: " Grandma@Example.test ",
        role: "member",
      },
      admin,
      db,
    );
    expect(added).toMatchObject({
      email: "grandma@example.test",
      displayName: "Grandma",
      role: "member",
    });
    const [row] = await db.select().from(users).where(eq(users.id, added.id));
    expect(row!.passwordHash).toBeNull();

    const first = await resolveOidcAccount(
      claims("grandma@example.test"),
      options,
      db,
    );
    expect(first).toMatchObject({
      kind: "signed-in",
      via: "linked",
      user: { id: added.id, role: "member", displayName: "Grandma" },
    });
    const again = await resolveOidcAccount(
      claims("grandma@example.test"),
      options,
      db,
    );
    expect(again).toMatchObject({
      kind: "signed-in",
      via: "identity",
      user: { id: added.id },
    });
  });

  it("does not link on an address the provider has not verified, unless told to trust it", async () => {
    const { admin } = await household();
    await addFamilyMember(
      { displayName: "Sam", email: "sam@example.test", role: "viewer" },
      admin,
      db,
    );
    expect(
      await resolveOidcAccount(claims("sam@example.test", false), options, db),
    ).toEqual({
      kind: "refused",
      reason: "unverified-email",
    });
    expect(
      await resolveOidcAccount(
        claims("sam@example.test", false),
        { ...options, trustEmail: true },
        db,
      ),
    ).toMatchObject({
      kind: "signed-in",
      via: "linked",
    });
  });

  it("takes an optional password, checked like any other", async () => {
    const { admin } = await household();
    await expect(
      addFamilyMember(
        {
          displayName: "Kid",
          email: "kid@example.test",
          role: "viewer",
          password: "short",
        },
        admin,
        db,
      ),
    ).rejects.toThrow();
    const kid = await addFamilyMember(
      {
        displayName: "Kid",
        email: "kid@example.test",
        role: "viewer",
        password: "correct horse battery",
      },
      admin,
      db,
    );
    const [row] = await db.select().from(users).where(eq(users.id, kid.id));
    expect(row!.passwordHash).toBeTruthy();
  });

  it("is for admins, and refuses an address already in use", async () => {
    const { admin, member, users: u } = await household();
    await expect(
      addFamilyMember(
        { displayName: "X", email: "x@example.test", role: "admin" },
        member,
        db,
      ),
    ).rejects.toThrow();
    await expect(
      addFamilyMember(
        {
          displayName: "Dup",
          email: u.viewer.email.toUpperCase(),
          role: "viewer",
        },
        admin,
        db,
      ),
    ).rejects.toThrow(/already signs in/);
    await expect(
      addFamilyMember(
        { displayName: "", email: "y@example.test", role: "viewer" },
        admin,
        db,
      ),
    ).rejects.toThrow(/name/);
    await expect(
      addFamilyMember(
        { displayName: "Y", email: "not-an-address", role: "viewer" },
        admin,
        db,
      ),
    ).rejects.toThrow(/email/);
  });

  it("brings back someone who was removed, free to sign on again", async () => {
    const { admin } = await household();
    const pat = await addFamilyMember(
      { displayName: "Pat", email: "pat@example.test", role: "member" },
      admin,
      db,
    );
    await resolveOidcAccount(claims("pat@example.test"), options, db);
    await removeUser(pat.id, admin, db);
    expect(
      await resolveOidcAccount(claims("pat@example.test"), options, db),
    ).toEqual({ kind: "refused", reason: "removed" });

    const back = await addFamilyMember(
      { displayName: "Pat", email: "pat@example.test", role: "viewer" },
      admin,
      db,
    );
    expect(back.id).toBe(pat.id);
    expect(
      await resolveOidcAccount(claims("pat@example.test"), options, db),
    ).toMatchObject({
      kind: "signed-in",
      user: { id: pat.id, role: "viewer" },
    });
  });
});
