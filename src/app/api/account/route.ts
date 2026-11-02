import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  foodSafetyLogs,
  ingredients,
  invoices,
  locations,
  menuItems,
  orders,
  posSaleLines,
  purchaseOrders,
  restaurants,
  shiftCounts,
  staffShifts,
  users,
  wastageLogs,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { integrationConnections } from "@/db/schema";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can export", 403);

  const restaurantId = session.restaurantId;
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const team = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
    })
    .from(users)
    .where(eq(users.restaurantId, restaurantId));
  const menu = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId));
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  const tickets = await db
    .select()
    .from(orders)
    .where(eq(orders.restaurantId, restaurantId));
  const waste = await db
    .select()
    .from(wastageLogs)
    .where(eq(wastageLogs.restaurantId, restaurantId));
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.restaurantId, restaurantId));
  const counts = await db
    .select()
    .from(shiftCounts)
    .where(eq(shiftCounts.restaurantId, restaurantId));
  const safety = await db
    .select({
      id: foodSafetyLogs.id,
      kind: foodSafetyLogs.kind,
      reading: foodSafetyLogs.reading,
      note: foodSafetyLogs.note,
      createdAt: foodSafetyLogs.createdAt,
    })
    .from(foodSafetyLogs)
    .where(eq(foodSafetyLogs.restaurantId, restaurantId));
  const shifts = await db
    .select()
    .from(staffShifts)
    .where(eq(staffShifts.restaurantId, restaurantId));
  const pos = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.restaurantId, restaurantId));
  const sites = await db
    .select()
    .from(locations)
    .where(eq(locations.restaurantId, restaurantId));
  const connections = await db
    .select({
      id: integrationConnections.id,
      provider: integrationConnections.provider,
      status: integrationConnections.status,
      lastSyncedAt: integrationConnections.lastSyncedAt,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.restaurantId, restaurantId));
  const saleLines = connections.length
    ? await db.select().from(posSaleLines)
    : [];

  return jsonOk({
    exportedAt: new Date().toISOString(),
    restaurant,
    team,
    menu,
    stock,
    tickets,
    waste,
    invoices: invoiceRows,
    counts,
    safety,
    shifts,
    purchaseOrders: pos,
    locations: sites,
    registerConnections: connections,
    registerSales: saleLines.filter((line) =>
      connections.some((c) => c.id === line.connectionId),
    ),
  });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can delete the restaurant", 403);
  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, session.restaurantId))
    .limit(1);
  if (!restaurant) return jsonError("Restaurant not found", 404);
  if (body?.name?.trim() !== restaurant.name) {
    return jsonError("Type the restaurant name to confirm");
  }
  if (restaurant.isTest) {
    return jsonError("The shared test kitchens stay in place", 403);
  }
  await db.delete(restaurants).where(and(eq(restaurants.id, restaurant.id), eq(restaurants.isTest, false)));
  return jsonOk({ deleted: true });
}
