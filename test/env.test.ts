import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

/* Fixtures only; they match no deployment. */
const SECRET = "x".repeat(32);
const KEY = "y".repeat(32);

/* The shape compose passes: a password-less URL, PGPASSWORD beside it, and every
   optional `${VAR:-}` as an empty string. */
const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://homedocs@db:5432/homedocs",
  PGPASSWORD: "p/w@x:y%z#q?r",
  SESSION_SECRET: SECRET,
  INTEGRATIONS_KEY: KEY,
  PUBLIC_BASE_URL: "https://homedocs.example.test",
  DATA_DIR: "/data",
  BACKUP_DIR: "/data/backups",
  TRUSTED_PROXY_HOPS: "1",
  CLIENT_IP_HEADER: "x-real-ip",
  OIDC_ISSUER: "",
  OIDC_CLIENT_ID: "",
  OIDC_CLIENT_SECRET: "",
  OIDC_DISPLAY_NAME: "",
  OIDC_ONLY: "",
  OIDC_TRUST_EMAIL: "",
  OIDC_DEFAULT_ROLE: "",
  TZ: "America/New_York",
};

const sso = {
  OIDC_ISSUER: "https://id.example.test",
  OIDC_CLIENT_ID: "homedocs",
  OIDC_CLIENT_SECRET: "client-secret-value",
};

function refusal(raw: Record<string, string | undefined>): string {
  try {
    parseEnv(raw);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("expected the environment to be refused");
}

describe("parseEnv", () => {
  it("accepts what compose passes, with blank optional values", () => {
    const env = parseEnv(production);
    expect(env.INTEGRATIONS_KEY).toBe(KEY);
    expect(env.OIDC_ISSUER).toBeUndefined();
    expect(env.CLIENT_IP_HEADER).toBe("x-real-ip");
  });

  it("accepts single sign-on with every setting the reader understands", () => {
    expect(
      parseEnv({
        ...production,
        ...sso,
        OIDC_DISPLAY_NAME: "Family sign-on",
        OIDC_ONLY: "On",
        OIDC_TRUST_EMAIL: " true",
        OIDC_DEFAULT_ROLE: "Member",
      }),
    ).toBeTruthy();
  });

  it("accepts an origin with a trailing slash, and http only on localhost", () => {
    expect(
      parseEnv({
        ...production,
        PUBLIC_BASE_URL: "https://homedocs.example.test/",
      }),
    ).toBeTruthy();
    expect(
      parseEnv({ ...production, PUBLIC_BASE_URL: "http://localhost:3000" }),
    ).toBeTruthy();
    expect(
      refusal({
        ...production,
        PUBLIC_BASE_URL: "http://homedocs.example.test",
      }),
    ).toContain("PUBLIC_BASE_URL");
    expect(
      refusal({
        ...production,
        PUBLIC_BASE_URL: "https://example.test/homedocs",
      }),
    ).toContain("PUBLIC_BASE_URL");
  });

  it("refuses an origin the readers would use unnormalised", () => {
    /* baseUrl() strips only trailing slashes, so each of these would reach a share
       link or the OAuth issuer as written. */
    for (const value of [
      "https://homedocs.example.test ",
      "https://homedocs.example.test/?",
      "https://homedocs.example.test#",
      "https://HomeDocs.example.test",
      "https://homedocs.example.test:443",
      "https://user@homedocs.example.test",
    ]) {
      expect(refusal({ ...production, PUBLIC_BASE_URL: value })).toContain(
        "PUBLIC_BASE_URL",
      );
    }
    expect(
      parseEnv({
        ...production,
        PUBLIC_BASE_URL: "https://homedocs.example.test:8443",
      }),
    ).toBeTruthy();
  });

  it("names every missing required variable and prints no value", () => {
    const message = refusal({
      NODE_ENV: "production",
      SESSION_SECRET: "short-secret-value",
    });
    for (const name of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "INTEGRATIONS_KEY",
      "PUBLIC_BASE_URL",
    ]) {
      expect(message).toContain(name);
    }
    expect(message).not.toContain("short-secret-value");
  });

  it("counts a blank required variable as missing", () => {
    expect(refusal({ ...production, INTEGRATIONS_KEY: "   " })).toContain(
      "INTEGRATIONS_KEY must be set",
    );
  });

  it("refuses secrets shorter than 32 characters", () => {
    expect(
      refusal({ ...production, SESSION_SECRET: "s".repeat(31) }),
    ).toContain("SESSION_SECRET must be at least 32 characters");
    expect(
      refusal({ ...production, INTEGRATIONS_KEY: "k".repeat(31) }),
    ).toContain("INTEGRATIONS_KEY must be at least 32 characters");
  });

  it("refuses an INTEGRATIONS_KEY equal to SESSION_SECRET, without printing either", () => {
    const message = refusal({ ...production, INTEGRATIONS_KEY: SECRET });
    expect(message).toContain(
      "INTEGRATIONS_KEY must differ from SESSION_SECRET",
    );
    expect(message).not.toContain(SECRET);
  });

  it("refuses single sign-on half configured, naming what is missing", () => {
    const message = refusal({ ...production, OIDC_ISSUER: sso.OIDC_ISSUER });
    expect(message).toContain("OIDC_CLIENT_ID");
    expect(message).toContain("OIDC_CLIENT_SECRET");
    expect(message).not.toContain(sso.OIDC_ISSUER);
    expect(
      refusal({ ...production, ...sso, OIDC_ISSUER: "id.example.test" }),
    ).toContain("OIDC_ISSUER");
  });

  it("refuses values the readers would quietly misread", () => {
    expect(refusal({ ...production, OIDC_ONLY: "enabled" })).toContain(
      "OIDC_ONLY",
    );
    expect(refusal({ ...production, OIDC_DEFAULT_ROLE: "admin" })).toContain(
      "OIDC_DEFAULT_ROLE",
    );
    expect(refusal({ ...production, TRUSTED_PROXY_HOPS: "0" })).toContain(
      "TRUSTED_PROXY_HOPS",
    );
    expect(refusal({ ...production, TRUSTED_PROXY_HOPS: "two" })).toContain(
      "TRUSTED_PROXY_HOPS",
    );
    expect(refusal({ ...production, CLIENT_IP_HEADER: "x real ip" })).toContain(
      "CLIENT_IP_HEADER",
    );
    expect(refusal({ ...production, WORKER: "of" })).toContain("WORKER");
    expect(refusal({ ...production, TZ: "Eastern" })).toContain("TZ");
  });

  it("needs PGPASSWORD in production when the URL carries no password", () => {
    expect(refusal({ ...production, PGPASSWORD: undefined })).toContain(
      "PGPASSWORD",
    );
    expect(refusal({ ...production, PGPASSWORD: "" })).toContain("PGPASSWORD");
    expect(
      parseEnv({
        ...production,
        PGPASSWORD: undefined,
        DATABASE_URL: "postgres://homedocs:pw@db:5432/homedocs",
      }),
    ).toBeTruthy();
    expect(
      parseEnv({
        ...production,
        NODE_ENV: "development",
        PGPASSWORD: undefined,
      }),
    ).toBeTruthy();
  });

  it("refuses a DATABASE_URL that is not postgres", () => {
    expect(
      refusal({ ...production, DATABASE_URL: "mysql://homedocs@db/homedocs" }),
    ).toContain("DATABASE_URL");
  });
});
