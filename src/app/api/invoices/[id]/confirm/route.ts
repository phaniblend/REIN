import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  auditEvents,
  ingredients,
  invoiceLines,
  invoices,
  locationStock,
  priceHistory,
  stockReceipts,
  supplierItems,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { num } from "@/lib/utils";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") {
    return jsonError("Only the owner can confirm an invoice", 403);
  }

  const { id } = await context.params;
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, id), eq(invoices.restaurantId, session.restaurantId)),
    )
    .limit(1);
  if (!invoice) return jsonError("Invoice not found", 404);
  if (invoice.status === "confirmed") {
    return jsonError("This invoice is already confirmed", 409);
  }

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoice.id));
  const postable = lines.filter(
    (line) => line.ingredientId && num(line.qty) > 0,
  );
  if (!postable.length) {
    return jsonError("Match at least one line to a stock item before confirming", 400);
  }

  for (const line of postable) {
    const ingredientId = line.ingredientId!;
    const [ing] = await db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.id, ingredientId),
          eq(ingredients.restaurantId, session.restaurantId),
        ),
      )
      .limit(1);
    if (!ing) continue;
    const qty = num(line.qty);
    const unitCost = num(line.unitPriceCents) / 100;
    const previous = num(ing.costPerUnit);
    await db.insert(stockReceipts).values({
      restaurantId: session.restaurantId,
      ingredientId,
      receivedBy: session.id,
      quantity: qty.toFixed(3),
      unitCost: unitCost.toFixed(2),
      supplierNote: `Invoice ${invoice.supplierName}`,
    });
    await db.insert(priceHistory).values({
      ingredientId,
      supplierName: invoice.supplierName,
      unitPriceCents: line.unitPriceCents,
    });
    await db
      .update(ingredients)
      .set({
        currentStock: (num(ing.currentStock) + qty).toFixed(3),
        costPerUnit: unitCost.toFixed(2),
      })
      .where(eq(ingredients.id, ingredientId));
    if (invoice.locationId) {
      const [bin] = await db
        .select()
        .from(locationStock)
        .where(
          and(
            eq(locationStock.locationId, invoice.locationId),
            eq(locationStock.ingredientId, ingredientId),
          ),
        )
        .limit(1);
      if (bin) {
        await db
          .update(locationStock)
          .set({ qty: (num(bin.qty) + qty).toFixed(3) })
          .where(eq(locationStock.id, bin.id));
      } else {
        await db.insert(locationStock).values({
          locationId: invoice.locationId,
          ingredientId,
          qty: qty.toFixed(3),
        });
      }
    }
    if (invoice.supplierId) {
      const [sku] = await db
        .select()
        .from(supplierItems)
        .where(
          and(
            eq(supplierItems.supplierId, invoice.supplierId),
            eq(supplierItems.ingredientId, ingredientId),
          ),
        )
        .limit(1);
      if (sku) {
        await db
          .update(supplierItems)
          .set({
            lastPriceCents: line.unitPriceCents,
            packSize: qty.toFixed(3),
            packUnit: ing.unit,
          })
          .where(eq(supplierItems.id, sku.id));
      } else {
        await db.insert(supplierItems).values({
          supplierId: invoice.supplierId,
          ingredientId,
          packSize: qty.toFixed(3),
          packUnit: ing.unit,
          lastPriceCents: line.unitPriceCents,
        });
      }
    }
    if (previous > 0 && Math.abs(unitCost - previous) / previous > 0.15) {
      await db.insert(alerts).values({
        restaurantId: session.restaurantId,
        type: "price_change",
        payload: JSON.stringify({
          ingredientId,
          name: ing.name,
          previous,
          unitCost,
          supplierName: invoice.supplierName,
        }),
      });
    }
  }

  const [confirmed] = await db
    .update(invoices)
    .set({
      status: "confirmed",
      confirmedBy: session.id,
      confirmedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))
    .returning();

  await db.insert(auditEvents).values({
    restaurantId: session.restaurantId,
    userId: session.id,
    action: "invoice.confirm",
    target: invoice.id,
  });

  return jsonOk({ invoice: confirmed });
}
