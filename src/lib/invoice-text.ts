import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ingredients } from "@/db/schema";
import { matchConfidence } from "@/lib/units";

export type ParsedLine = {
  rawText: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  confidence: number;
  ingredientId: string | null;
};

const UNITS = ["KG", "G", "L", "ML", "PIECE", "PACKET"] as const;

/** Reads plain invoice lines like "Onion 8 KG 1.50". */
export function parseInvoiceText(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const match = trimmed.match(
      /^(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)\s+(\d+(?:\.\d+)?)\s*$/,
    );
    if (!match) {
      lines.push({
        rawText: trimmed,
        name: trimmed,
        qty: 0,
        unit: "",
        unitPrice: 0,
        confidence: 0.3,
        ingredientId: null,
      });
      continue;
    }
    const unit = match[3].toUpperCase();
    lines.push({
      rawText: trimmed,
      name: match[1].trim(),
      qty: Number(match[2]),
      unit: (UNITS as readonly string[]).includes(unit) ? unit : unit,
      unitPrice: Number(match[4]),
      confidence: 0.92,
      ingredientId: null,
    });
  }
  return lines;
}

export async function matchLines(restaurantId: string, lines: ParsedLine[]) {
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  return lines.map((line) => {
    let best: { id: string; score: number } | null = null;
    for (const item of stock) {
      const score = matchConfidence(line.name, item.name);
      if (!best || score > best.score) best = { id: item.id, score };
    }
    if (!best || best.score < 0.86) return line;
    return {
      ...line,
      ingredientId: best.id,
      confidence: Math.min(line.confidence, 1) * best.score,
    };
  });
}
