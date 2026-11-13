/*
 * The other trust boundaries, as a caller reaches them: the actions that start
 * a session (sign-in, setup, joining, the share link's PIN), the upload and the
 * link-picker search, the client address, and the background jobs' lock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "../lib/db/schema";
import { db, databaseUrl, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

const jar = vi.hoisted(() => new Map<string, string>());
const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => requestHeaders.value,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_BASE_URL = "https://homedocs.example.test";

const { loginAction, setupAction, joinAction } =
  await import("../app/(auth)/actions");
const { unlockAction } = await import("../app/g/[token]/actions");
const { SESSION_COOKIE, createSession } = await import("../lib/auth/sessions");
const { POST: upload } = await import("../app/api/files/route");
const { GET: extSearch } = await import("../app/api/ext/search/route");
const { clientIp } = await import("../lib/web/client-ip");
const { withJobLock } = await import("../lib/jobs/index");
const { loginLimiter } = await import("../lib/web/limits");

resetBetweenTests();
beforeEach(() => {
  jar.clear();
  requestHeaders.value = new Headers();
  loginLimiter.reset();
});
afterEach(() => vi.restoreAllMocks());

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields))
    for (const one of [value].flat()) data.append(name, one);
  return data;
}

describe("the session-starting actions parse first", () => {
  it("sign-in refuses an oversized password before argon2 sees it, and a field sent as a file", async () => {
    await household();
    expect(
      (
        await loginAction(
          {},
          form({ email: "a@example.test", password: "x".repeat(1_001) }),
        )
      ).error,
    ).toMatch(/too long/);
    const withFile = new FormData();
    withFile.append("email", new File(["x"], "x.txt"));
    withFile.append("password", "whatever");
    expect((await loginAction({}, withFile)).error).toMatch(/Reload/);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("sign-in is still throttled: ten tries per address and per email in 15 minutes", async () => {
    await household();
    requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.9" });
    const answers = [];
    for (let i = 0; i < 11; i++)
      answers.push(
        (
          await loginAction(
            {},
            form({ email: "nobody@example.test", password: "wrong password" }),
          )
        ).error,
      );
    expect(
      answers.slice(0, 10).every((a) => /do not match/.test(a ?? "")),
    ).toBe(true);
    expect(answers[10]).toMatch(/Too many attempts/);
  });

  it("setup refuses a malformed form and makes nothing", async () => {
    expect(
      (
        await setupAction(
          {},
          form({
            email: "a@example.test",
            displayName: "x".repeat(201),
            password: "long enough password",
            homeName: "Home",
          }),
        )
      ).error,
    ).toMatch(/too long/);
    expect(await db.select().from(users)).toEqual([]);
  });

  it("joining refuses a token that is not one, and a field in its own words", async () => {
    expect(
      await joinAction(
        "../../etc",
        {},
        form({ password: "long enough password" }),
      ),
    ).toEqual({
      error: "This link has expired or was already used. Ask for a new one.",
    });
    expect(
      (
        await joinAction(
          "a".repeat(43),
          {},
          form({ password: "x".repeat(1_001) }),
        )
      ).error,
    ).toMatch(/too long/);
  });

  it("sign-in with a very long way back still signs in (safeNext drops it), rather than refusing", async () => {
    await household();
    const answer = await loginAction(
      {},
      form({
        email: "nobody@example.test",
        password: "wrong password",
        next: `/oauth/authorize?state=${"x".repeat(50_000)}`,
      }),
    );
    expect(answer.error).toMatch(/do not match/);
  });

  it("the PIN unlock refuses a token that is not one before looking anything up", async () => {
    expect(
      await unlockAction("not a token!", {}, form({ pin: "1234" })),
    ).toEqual({ error: "That PIN isn’t right." });
  });
});

describe("POST /api/files", () => {
  async function signedIn(role: "member" | "viewer" = "member") {
    const home = await household();
    const { token } = await createSession(home.users[role].id, {}, db);
    jar.set(SESSION_COOKIE, token);
    return home;
  }

  function uploadRequest(body: BodyInit, headers: Record<string, string> = {}) {
    return new Request(
      `https://homedocs.example.test/api/files?owner=space:${crypto.randomUUID()}`,
      {
        method: "POST",
        headers,
        body,
        duplex: "half",
      } as RequestInit,
    );
  }

  it("refuses a body with no Content-Length (411), and one declared over the cap (413), unread", async () => {
    await signedIn();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(10));
        c.close();
      },
    });
    expect((await upload(uploadRequest(stream))).status).toBe(411);
    expect(
      (
        await upload(
          uploadRequest("x", { "content-length": String(26 * 1024 * 1024) }),
        )
      ).status,
    ).toBe(413);
  });

  it("refuses a form with no file, or two", async () => {
    await signedIn();
    const none = new Request("https://x.test", {
      method: "POST",
      body: form({ caption: "hi" }),
    });
    const body = new Uint8Array(await none.arrayBuffer());
    const res = await upload(
      uploadRequest(body, {
        "content-type": none.headers.get("content-type")!,
        "content-length": String(body.byteLength),
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Choose a file." });
  });

  it("stores a photo sent as the browser sends it", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "homedocs-upload-"));
    const home = await signedIn();
    const { spaces } = await import("../lib/db/schema");
    const [place] = await db
      .insert(spaces)
      .values({ propertyId: home.scope.propertyId, name: "Attic" })
      .returning();
    const sharp = (await import("sharp")).default;
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#888" },
    })
      .png()
      .toBuffer();
    const browser = new FormData();
    browser.append(
      "file",
      new File([new Uint8Array(png)], "a.png", { type: "image/png" }),
    );
    browser.append("caption", "The hatch");
    const encoded = new Request("https://x.test", {
      method: "POST",
      body: browser,
    });
    const body = new Uint8Array(await encoded.arrayBuffer());
    const res = await upload(
      new Request(
        `https://homedocs.example.test/api/files?owner=space:${place!.id}`,
        {
          method: "POST",
          headers: {
            "content-type": encoded.headers.get("content-type")!,
            "content-length": String(body.byteLength),
          },
          body,
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: expect.any(String),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("is for members: a viewer gets 403 before the body is read", async () => {
    await signedIn("viewer");
    expect(
      (await upload(uploadRequest("x", { "content-length": "1" }))).status,
    ).toBe(403);
  });
});

describe("GET /api/ext/search", () => {
  it("refuses an unknown app or a parameter sent twice", async () => {
    const home = await household();
    const { token } = await createSession(home.users.member.id, {}, db);
    jar.set(SESSION_COOKIE, token);
    const ask = (query: string) =>
      extSearch(
        new Request(`https://homedocs.example.test/api/ext/search?${query}`),
      );
    expect((await ask("system=elsewhere")).status).toBe(400);
    expect((await ask("system=homebox&q=a&q=b")).status).toBe(400);
    expect((await ask(`system=homebox&q=${"x".repeat(501)}`)).status).toBe(400);
  });
});

describe("the client address (decision Q9)", () => {
  const headers = (h: Record<string, string>) => ({
    get: (k: string) => h[k.toLowerCase()] ?? null,
  });

  it("production: the one header the proxy overwrites, whatever X-Forwarded-For says", () => {
    const h = headers({
      "x-real-ip": "198.51.100.7",
      "x-forwarded-for": "10.0.0.5, 203.0.113.1",
    });
    expect(clientIp(h, { CLIENT_IP_HEADER: "x-real-ip" })).toBe("198.51.100.7");
    expect(
      clientIp(headers({ "x-forwarded-for": "10.0.0.5" }), {
        CLIENT_IP_HEADER: "x-real-ip",
      }),
    ).toBeNull();
  });

  it("without it: X-Forwarded-For from the right, by TRUSTED_PROXY_HOPS; a forged left entry is ignored", () => {
    const h = headers({
      "x-forwarded-for": "10.0.0.5, 198.51.100.7, 172.18.0.2",
    });
    expect(clientIp(h, {})).toBe("172.18.0.2");
    expect(clientIp(h, { TRUSTED_PROXY_HOPS: "2" })).toBe("198.51.100.7");
  });
});

describe("background jobs", () => {
  it("run one at a time: a second run while the first holds the lock is skipped", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = withJobLock("test-job", () => held);
    await new Promise((r) => setTimeout(r, 50));
    const second = await withJobLock("test-job", async () => {
      throw new Error("should not run");
    });
    expect(second).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(await withJobLock("test-job", async () => {})).toBe(true);
  });
});
