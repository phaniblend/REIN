import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ingredients, invoiceLines, invoices } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const schema = z.object({
  lineId: z.string().uuid(),
  ingredientId: z.string().uuid().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("You can't edit invoice lines", 403);
  }
  const { id } = await context.params;
  const body = schema.parse(await readJson(request));
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.restaurantId, session.restaurantId)))
    .limit(1);
  if (!invoice) return jsonError("Invoice not found", 404);
  if (invoice.status !== "draft") return jsonError("This invoice is already confirmed", 409);
  const [line] = await db
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.id, body.lineId), eq(invoiceLines.invoiceId, invoice.id)))
    .limit(1);
  if (!line) return jsonError("Line not found", 404);
  if (body.ingredientId) {
    const [item] = await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(
        and(
          eq(ingredients.id, body.ingredientId),
          eq(ingredients.restaurantId, session.restaurantId),
        ),
      )
      .limit(1);
    if (!item) return jsonError("Stock item not found", 404);
  }
  const [updated] = await db
    .update(invoiceLines)
    .set({
      ingredientId: body.ingredientId,
      confidence: body.ingredientId ? "1.000" : line.confidence,
    })
    .where(eq(invoiceLines.id, line.id))
    .returning();
  return jsonOk({ line: updated });
}
