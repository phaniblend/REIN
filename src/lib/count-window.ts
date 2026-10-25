/** Start of the next count: the previous close, or a 16-hour window on the first count. */
export function countWindowStart(
  lastClosedAt: Date | string | null | undefined,
  now = Date.now(),
  sinceHours = 16,
) {
  if (lastClosedAt) return new Date(lastClosedAt);
  return new Date(now - sinceHours * 60 * 60 * 1000);
}
