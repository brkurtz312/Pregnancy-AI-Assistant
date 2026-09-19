/**
 * Reads a millisecond interval from the environment, falling back to a default
 * when the variable is absent or not a usable number.
 *
 * Zero is a meaningful value, not a rejected one: every caller treats it as
 * "do not run this worker at all". That is how a second server pointed at the
 * same database is stopped from duplicating background work.
 */
export function parseEnvMs(key: string, defaultMs: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultMs;
  const n = Number(raw);
  return Number.isNaN(n) || n < 0 ? defaultMs : n;
}
