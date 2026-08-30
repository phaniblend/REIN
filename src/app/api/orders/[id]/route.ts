import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const schema = z.object({
  status: z.enum(["PENDING", "PREPARING", "SERVED", "RETURNED", "CANCELLED"]),
  itemId: z.string().uuid().optional(),
  returnReason: z
    .enum([
      "CUSTOMER_TASTE",
      "DEFECT_BURNT",
      "DEFECT_COLD",
      "DEFECT_FOREIGN_OBJECT",
      "WAITER_WRONG_PUNCH",
      "OTHER",
    ])
    .optional(),
  isWasted: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await context.params;

  try {
    const body = schema.parse(await readJson(request));
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.restaurantId, session.restaurantId)))
      .limit(1);
    if (!order) return jsonError("Order not found", 404);

    if (body.itemId) {
      await db
        .update(orderItems)
        .set({
          status: body.status,
          returnReason: body.returnReason,
          isWasted: body.isWasted ?? (body.status === "RETURNED" ? true : undefined),
        })
        .where(
          and(eq(orderItems.id, body.itemId), eq(orderItems.orderId, order.id)),
        );
    } else {
      await db.update(orders).set({ status: body.status }).where(eq(orders.id, id));
      await db
        .update(orderItems)
        .set({ status: body.status })
        .where(eq(orderItems.orderId, id));
    }

    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to update order", 500);
  }
}
