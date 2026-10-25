import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  ingredients,
  menuItems,
  orders,
  restaurants,
  users,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can export", 403);

  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, session.restaurantId))
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
    .where(eq(users.restaurantId, session.restaurantId));
  const menu = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, session.restaurantId));
  const stock = await db
    .select()
    .from(ingredients)
    .where(eq(ingredients.restaurantId, session.restaurantId));
  const tickets = await db
    .select()
    .from(orders)
    .where(eq(orders.restaurantId, session.restaurantId));

  return jsonOk({
    exportedAt: new Date().toISOString(),
    restaurant,
    team,
    menu,
    stock,
    tickets,
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
