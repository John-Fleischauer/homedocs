import { purgeExpiredSessions } from "../auth/sessions";
import { db } from "../db";
import { pruneUnconsentedClients } from "../oauth/clients";
import { purgeExpiredTokens } from "../oauth/grants";
import type { Job } from "./index";

const HOUR = 60 * 60 * 1000;

export const jobs: Job[] = [
  {
    name: "purge-sessions",
    everyMs: 24 * HOUR,
    run: () => purgeExpiredSessions(),
  },
  {
    name: "purge-oauth",
    everyMs: 24 * HOUR,
    run: async () =>
      void (await purgeExpiredTokens(db), await pruneUnconsentedClients(db)),
  },
];
