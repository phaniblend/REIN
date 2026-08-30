import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItems, orderItems, orders, recipeBoms } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const createSchema = z.object({
  tableNumber: z.string().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .min(1),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.restaurantId, session.restaurantId))
    .orderBy(desc(orders.createdAt))
    .limit(40);

  const withItems = await Promise.all(
    rows.map(async (order) => {
      const items = await db
        .select({
          id: orderItems.id,
          menuItemId: orderItems.menuItemId,
          menuItemName: menuItems.name,
          quantity: orderItems.quantity,
          status: orderItems.status,
          returnReason: orderItems.returnReason,
          isWasted: orderItems.isWasted,
        })
        .from(orderItems)
        .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
        .where(eq(orderItems.orderId, order.id));
      return { ...order, items };
    }),
  );

  return jsonOk({ orders: withItems });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "WAITER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = createSchema.parse(await readJson(request));

    const [order] = await db
      .insert(orders)
      .values({
        restaurantId: session.restaurantId,
        waiterId: session.id,
        tableNumber: body.tableNumber,
        status: "PENDING",
      })
      .returning();

    await db.insert(orderItems).values(
      body.items.map((item) => ({
        orderId: order.id,
        menuItemId: item.menuItemId,
        quantity: String(item.quantity),
        status: "PENDING" as const,
      })),
    );

    return jsonOk({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to create order", 500);
  }
}
