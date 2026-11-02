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
