const MASS: Record<string, number> = { G: 1, KG: 1000 };
const VOLUME: Record<string, number> = { ML: 1, L: 1000 };

/** Convert a quantity between units. Returns null when the units are not comparable. */
export function convertQty(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  if (MASS[from] && MASS[to]) return (qty * MASS[from]) / MASS[to];
  if (VOLUME[from] && VOLUME[to]) return (qty * VOLUME[from]) / VOLUME[to];
  return null;
}

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 1 is an exact name match. 0.86 is a contained name. Otherwise token overlap. */
export function matchConfidence(a: string, b: string) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = right.split(" ").filter(Boolean);
  if (!rightTokens.length) return 0;
  const hits = rightTokens.filter((token) => leftTokens.has(token)).length;
  return hits / Math.max(rightTokens.length, leftTokens.size);
}

export const AUTO_MAP_CONFIDENCE = 0.9;
