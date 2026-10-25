import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  integrationConnections,
  menuItems,
  posItemMappings,
  posItems,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { connectDemoRegister, ensureLocation, ingestSale } from "@/lib/pos-sync";
import { connectors, syncStaleConnections } from "@/lib/connectors";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  await syncStaleConnections(session.restaurantId);

  const connections = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.restaurantId, session.restaurantId));

  const catalog = await db
    .select({
      id: posItems.id,
      name: posItems.name,
      externalId: posItems.externalId,
      connectionId: posItems.connectionId,
      dishId: posItemMappings.dishId,
      confidence: posItemMappings.confidence,
      mappedBy: posItemMappings.mappedBy,
      status: posItemMappings.status,
    })
    .from(posItems)
    .innerJoin(
      integrationConnections,
      eq(posItems.connectionId, integrationConnections.id),
    )
    .leftJoin(posItemMappings, eq(posItemMappings.posItemId, posItems.id))
    .where(eq(integrationConnections.restaurantId, session.restaurantId));

  const dishes = await db
    .select({ id: menuItems.id, name: menuItems.name })
    .from(menuItems)
    .where(eq(menuItems.restaurantId, session.restaurantId));

  return jsonOk({
    connections,
    catalog,
    dishes,
    providers: {
      square: connectors.square.configured(),
      clover: connectors.clover.configured(),
      toast: connectors.toast.configured(),
      quickbooks: Boolean(
        process.env.INTUIT_CLIENT_ID && process.env.INTUIT_CLIENT_SECRET,
      ),
      delivery: Boolean(process.env.DELIVERECT_SECRET),
    },
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect-demo") }),
  z.object({
    action: z.literal("disconnect"),
    connectionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("test-sale"),
    connectionId: z.string().uuid(),
    externalLineId: z.string().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal("map"),
    posItemId: z.string().uuid(),
    dishId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("suggest"),
    posItemId: z.string().uuid(),
    dishId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("unmap"),
    posItemId: z.string().uuid(),
  }),
  z.object({ action: z.literal("connect-delivery") }),
  z.object({
    action: z.literal("delivery-sale"),
    connectionId: z.string().uuid(),
    itemName: z.string().min(1).max(160),
    qty: z.number().positive(),
    netCents: z.number().nonnegative(),
  }),
]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const body = schema.parse(await readJson(request));
    if (body.action === "suggest") {
      if (!["OWNER", "CHEF"].includes(session.role)) {
        return jsonError("Only the owner or chef can suggest a mapping", 403);
      }
      const [item] = await db
        .select({ id: posItems.id })
        .from(posItems)
        .innerJoin(
          integrationConnections,
          eq(posItems.connectionId, integrationConnections.id),
        )
        .where(
          and(
            eq(posItems.id, body.posItemId),
            eq(integrationConnections.restaurantId, session.restaurantId),
          ),
        )
        .limit(1);
      if (!item) return jsonError("Register item not found", 404);
      const [existing] = await db
        .select()
        .from(posItemMappings)
        .where(eq(posItemMappings.posItemId, body.posItemId))
        .limit(1);
      if (existing?.status === "confirmed") {
        return jsonError("That item is already mapped", 409);
      }
      if (existing) {
        const [mapping] = await db
          .update(posItemMappings)
          .set({
            dishId: body.dishId,
            mappedBy: session.id,
            status: "suggested",
            confidence: "0.500",
          })
          .where(eq(posItemMappings.id, existing.id))
          .returning();
        return jsonOk({ mapping });
      }
      const [mapping] = await db
        .insert(posItemMappings)
        .values({
          posItemId: body.posItemId,
          dishId: body.dishId,
          confidence: "0.500",
          mappedBy: session.id,
          status: "suggested",
        })
        .returning();
      return jsonOk({ mapping });
    }
    if (session.role !== "OWNER") {
      return jsonError("Only the owner can connect a register or confirm a mapping", 403);
    }

    if (body.action === "connect-demo") {
      const connectionId = await connectDemoRegister(session.restaurantId);
      return jsonOk({ connectionId }, { status: 201 });
    }

    if (body.action === "disconnect") {
      const [row] = await db
        .update(integrationConnections)
        .set({ status: "disconnected" })
        .where(
          and(
            eq(integrationConnections.id, body.connectionId),
            eq(integrationConnections.restaurantId, session.restaurantId),
          ),
        )
        .returning();
      if (!row) return jsonError("Connection not found", 404);
      return jsonOk({ connection: row });
    }

    if (body.action === "map") {
      const [item] = await db
        .select({ id: posItems.id })
        .from(posItems)
        .innerJoin(
          integrationConnections,
          eq(posItems.connectionId, integrationConnections.id),
        )
        .where(
          and(
            eq(posItems.id, body.posItemId),
            eq(integrationConnections.restaurantId, session.restaurantId),
          ),
        )
        .limit(1);
      if (!item) return jsonError("Register item not found", 404);
      const [dish] = await db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(
          and(
            eq(menuItems.id, body.dishId),
            eq(menuItems.restaurantId, session.restaurantId),
          ),
        )
        .limit(1);
      if (!dish) return jsonError("Dish not found", 404);
      await db
        .delete(posItemMappings)
        .where(eq(posItemMappings.posItemId, body.posItemId));
      const [mapping] = await db
        .insert(posItemMappings)
        .values({
          posItemId: body.posItemId,
          dishId: body.dishId,
          confidence: "1.000",
          mappedBy: session.id,
          status: "confirmed",
        })
        .returning();
      return jsonOk({ mapping });
    }

    if (body.action === "unmap") {
      const [item] = await db
        .select({ id: posItems.id })
        .from(posItems)
        .innerJoin(
          integrationConnections,
          eq(posItems.connectionId, integrationConnections.id),
        )
        .where(
          and(
            eq(posItems.id, body.posItemId),
            eq(integrationConnections.restaurantId, session.restaurantId),
          ),
        )
        .limit(1);
      if (!item) return jsonError("Register item not found", 404);
      await db
        .delete(posItemMappings)
        .where(eq(posItemMappings.posItemId, body.posItemId));
      return jsonOk({ ok: true });
    }

    if (body.action === "connect-delivery") {
      const location = await ensureLocation(session.restaurantId);
      const [existing] = await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.restaurantId, session.restaurantId),
            eq(integrationConnections.provider, "deliverect"),
            eq(integrationConnections.status, "connected"),
          ),
        )
        .limit(1);
      if (existing) return jsonOk({ connectionId: existing.id });
      const [created] = await db
        .insert(integrationConnections)
        .values({
          restaurantId: session.restaurantId,
          locationId: location.id,
          provider: "deliverect",
          status: "connected",
          scopes: "orders.read",
        })
        .returning();
      return jsonOk({ connectionId: created.id }, { status: 201 });
    }

    if (body.action !== "test-sale" && body.action !== "delivery-sale") {
      return jsonError("Unsupported action", 400);
    }

    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, body.connectionId),
          eq(integrationConnections.restaurantId, session.restaurantId),
          eq(integrationConnections.status, "connected"),
        ),
      )
      .limit(1);
    if (!connection) return jsonError("Connect a register first", 404);

    const externalLineId =
      body.action === "test-sale"
        ? (body.externalLineId ?? `demo-sale-${Date.now()}`)
        : `delivery-${Date.now()}`;
    const result = await ingestSale({
      connectionId: connection.id,
      externalLineId,
      externalItemId:
        body.action === "delivery-sale"
          ? `delivery:${body.itemName}`
          : "unmapped:house-special",
      itemName: body.action === "delivery-sale" ? body.itemName : "House special",
      qty: body.action === "delivery-sale" ? body.qty : 1,
      netCents: body.action === "delivery-sale" ? body.netCents : 1400,
      soldAt: new Date(),
      channel: body.action === "delivery-sale" ? "delivery" : "in_house",
    });
    await db
      .update(integrationConnections)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(integrationConnections.id, connection.id));
    return jsonOk({ ...result, externalLineId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Register sync failed", 500);
  }
}
