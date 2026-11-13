import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("/api/health", () => {
  // The deploy job reads `revision` to confirm the new image is running.
  it("reports ok and the revision", async () => {
    vi.stubEnv("GIT_REVISION", "abc1234");
    try {
      const res = GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, revision: "abc1234" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
