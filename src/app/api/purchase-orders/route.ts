import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ingredients, poLines, purchaseOrders, suppliers } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { suggestPurchaseLines } from "@/lib/purchasing";
import { binsFor, ensureLocationBins } from "@/lib/active-location";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";

const draftSchema = z.object({
  supplierName: z.string().min(1).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        qty: z.number().positive(),
      }),
    )
    .min(1),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }
  const location = await ensureLocationBins(session.restaurantId);
  const suggestions = await suggestPurchaseLines(
    session.restaurantId,
    await binsFor(location.id),
  );
  const orders = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.restaurantId, session.restaurantId))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(20);
  const lines = orders.length
    ? await db.select().from(poLines)
    : [];
  return jsonOk({ suggestions, orders, lines });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("You can't draft a purchase order", 403);
  }
  try {
    const body = draftSchema.parse(await readJson(request));
    const location = await ensureLocationBins(session.restaurantId);
    const name = body.supplierName.trim();
    const [existing] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.restaurantId, session.restaurantId), eq(suppliers.name, name)))
      .limit(1);
    const supplier =
      existing ??
      (
        await db
          .insert(suppliers)
          .values({
            restaurantId: session.restaurantId,
            name,
            phone: body.phone,
            email: body.email,
          })
          .returning()
      )[0];
    if (body.phone && supplier.phone !== body.phone) {
      await db.update(suppliers).set({ phone: body.phone }).where(eq(suppliers.id, supplier.id));
    }
    if (body.email && supplier.email !== body.email) {
      await db.update(suppliers).set({ email: body.email }).where(eq(suppliers.id, supplier.id));
    }
    const known = await db
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(eq(ingredients.restaurantId, session.restaurantId));
    const ids = new Set(known.map((row) => row.id));
    if (body.lines.some((line) => !ids.has(line.ingredientId))) {
      return jsonError("Unknown stock item", 400);
    }
    const [order] = await db
      .insert(purchaseOrders)
      .values({
        restaurantId: session.restaurantId,
        locationId: location.id,
        supplierId: supplier.id,
        supplierName: name,
        status: "draft",
      })
      .returning();
    await db.insert(poLines).values(
      body.lines.map((line) => ({
        purchaseOrderId: order.id,
        ingredientId: line.ingredientId,
        qty: line.qty.toFixed(3),
      })),
    );
    return jsonOk({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return jsonError(err.issues[0]?.message ?? "Invalid input");
    console.error(err);
    return jsonError("Could not save the order", 500);
  }
}

export async function sendPurchaseOrder(orderId: string, restaurantId: string, userId: string) {
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.restaurantId, restaurantId)))
    .limit(1);
  if (!order) return { error: "Order not found", status: 404 } as const;
  if (order.status === "sent") return { error: "Already sent", status: 409 } as const;
  const lines = await db.select().from(poLines).where(eq(poLines.purchaseOrderId, order.id));
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  const names = new Map(stock.map((row) => [row.id, `${row.name} ${row.unit}`]));
  const message = [
    `Order from the kitchen for ${order.supplierName}`,
    ...lines.map((line) => `${names.get(line.ingredientId) ?? "Item"} × ${line.qty}`),
  ].join("\n");
  let channel = "saved";
  if (order.supplierId) {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, order.supplierId))
      .limit(1);
    if (supplier?.email) {
      const mail = await sendEmail(supplier.email, `Order for ${order.supplierName}`, message);
      channel = mail.ok ? mail.provider : channel;
    }
    if (supplier?.phone) {
      const sms = await sendSms(supplier.phone, message);
      channel = supplier.email ? `${channel}+${sms.provider}` : sms.provider;
    }
  }
  await db
    .update(purchaseOrders)
    .set({ status: "sent", sentAt: new Date(), sentBy: userId })
    .where(eq(purchaseOrders.id, order.id));
  return { message, channel, status: 200 } as const;
}
