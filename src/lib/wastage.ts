export const WASTAGE_KINDS = [
  "KITCHEN_SPOILED",
  "PREP_ERROR",
  "DROPPED",
  "OVERCOOKED",
  "EXPIRED",
  "POS_RETURNED_WASTE",
  "POS_RETURNED_REUSED",
] as const;

export type WastageKind = (typeof WASTAGE_KINDS)[number];

/** Waiters only log POS returns — kitchen spoil is chef/stock/owner work. */
export const WAITER_WASTAGE_KINDS = [
  "POS_RETURNED_WASTE",
  "POS_RETURNED_REUSED",
] as const satisfies readonly WastageKind[];

export function wasteKindLabel(kind: string) {
  switch (kind) {
    case "KITCHEN_SPOILED":
      return "Kitchen spoiled";
    case "PREP_ERROR":
      return "Prep error";
    case "DROPPED":
      return "Dropped";
    case "OVERCOOKED":
      return "Overcooked";
    case "EXPIRED":
      return "Expired";
    case "POS_RETURNED_WASTE":
      return "Returned — wasted";
    case "POS_RETURNED_REUSED":
      return "Returned — reused";
    default:
      return kind.replaceAll("_", " ").toLowerCase();
  }
}

/** Stock goes down for every kind except a return that goes back into use. */
export function wasteDeductsStock(kind: string) {
  return kind !== "POS_RETURNED_REUSED";
}

/** Kitchen-side causes that AvT treats as logged kitchen wastage. */
export function isKitchenWasteKind(kind: string) {
  return (
    kind === "KITCHEN_SPOILED" ||
    kind === "PREP_ERROR" ||
    kind === "DROPPED" ||
    kind === "OVERCOOKED" ||
    kind === "EXPIRED"
  );
}

export function wastageKindsForRole(role: string): readonly WastageKind[] {
  if (role === "WAITER") return WAITER_WASTAGE_KINDS;
  return WASTAGE_KINDS;
}

export function canLogWastageKind(role: string, kind: string) {
  return (wastageKindsForRole(role) as readonly string[]).includes(kind);
}

/**
 * Dollar loss from stock actually removed. null when cost was never recorded
 * (older rows before unitCost was saved).
 */
export function wasteLossAmount(opts: {
  quantity: number;
  shortfall: number;
  unitCost: number;
  kind: string;
}): number | null {
  if (opts.kind === "POS_RETURNED_REUSED") return 0;
  if (!(opts.unitCost > 0)) return null;
  const removed = Math.max(0, opts.quantity - Math.max(0, opts.shortfall));
  return removed * opts.unitCost;
}
