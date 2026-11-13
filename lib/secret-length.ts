/*
 * The shortest SESSION_SECRET or INTEGRATIONS_KEY accepted: checked at boot
 * (lib/env.ts) and again at first use by the readers. Its own module so the
 * readers don't load the env schema to read one number.
 */
export const MIN_SECRET_LENGTH = 32;
