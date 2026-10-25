import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  ingredients,
  integrationConnections,
  locations,
  menuItems,
  posItemMappings,
  posItems,
  posSaleLines,
  recipeBoms,
  syncJobs,
} from "@/db/schema";
import { encryptToken } from "@/lib/token-box";
import { AUTO_MAP_CONFIDENCE, convertQty, matchConfidence } from "@/lib/units";
import { num } from "@/lib/utils";

export async function ensureLocation(restaurantId: string) {
  const [existing] = await db
    .select()
    .from(locations)
    .where(eq(locations.restaurantId, restaurantId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(locations)
    .values({ restaurantId, name: "Main", timezone: "America/Chicago" })
    .returning();
  return created;
}

export async function connectDemoRegister(restaurantId: string) {
  const location = await ensureLocation(restaurantId);
  const [existing] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.restaurantId, restaurantId),
        eq(integrationConnections.provider, "demo"),
        eq(integrationConnections.status, "connected"),
      ),
    )
    .limit(1);
  const connection =
    existing ??
    (
      await db
        .insert(integrationConnections)
        .values({
          restaurantId,
          locationId: location.id,
          provider: "demo",
          status: "connected",
          encryptedTokens: encryptToken(
            JSON.stringify({ provider: "demo", connectedAt: Date.now() }),
          ),
          scopes: "catalog.read orders.read",
        })
        .returning()
    )[0];

  const dishes = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.menuApprovalStatus, "APPROVED"),
        eq(menuItems.isActive, true),
      ),
    );

  for (const dish of dishes) {
    await upsertPosItem(connection.id, {
      externalId: `dish:${dish.id}`,
      name: dish.name,
      priceCents: Math.round(num(dish.sellingPrice) * 100),
    });
  }
  await upsertPosItem(connection.id, {
    externalId: "unmapped:house-special",
    name: "House special",
    priceCents: 1400,
  });

  const now = Date.now();
  for (const dish of dishes.slice(0, 12)) {
    await ingestSale({
      connectionId: connection.id,
      externalLineId: `backfill:${dish.id}`,
      externalItemId: `dish:${dish.id}`,
      itemName: dish.name,
      qty: 2,
      netCents: Math.round(num(dish.sellingPrice) * 200),
      soldAt: new Date(now - 2 * 60 * 60 * 1000),
    });
  }

  await autoMapConnection(connection.id, restaurantId);
  await db
    .update(integrationConnections)
    .set({ lastSyncedAt: new Date(), lastError: null, status: "connected" })
    .where(eq(integrationConnections.id, connection.id));
  await db.insert(syncJobs).values({
    connectionId: connection.id,
    kind: "backfill",
    status: "done",
    attempts: "1",
    finishedAt: new Date(),
  });

  return connection.id;
}

async function upsertPosItem(
  connectionId: string,
  item: { externalId: string; name: string; priceCents: number },
) {
  const [existing] = await db
    .select()
    .from(posItems)
    .where(
      and(
        eq(posItems.connectionId, connectionId),
        eq(posItems.externalId, item.externalId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(posItems)
      .set({ name: item.name, priceCents: String(item.priceCents) })
      .where(eq(posItems.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(posItems)
    .values({
      connectionId,
      externalId: item.externalId,
      name: item.name,
      priceCents: String(item.priceCents),
    })
    .returning();
  return created.id;
}

export async function ingestSale(input: {
  connectionId: string;
  externalLineId: string;
  externalItemId: string;
  itemName: string;
  qty: number;
  netCents: number;
  soldAt: Date;
  channel?: string;
}) {
  const [dup] = await db
    .select({ id: posSaleLines.id })
    .from(posSaleLines)
    .where(
      and(
        eq(posSaleLines.connectionId, input.connectionId),
        eq(posSaleLines.externalLineId, input.externalLineId),
      ),
    )
    .limit(1);
  if (dup) return { created: false as const, id: dup.id };

  const posItemId = await upsertPosItem(input.connectionId, {
    externalId: input.externalItemId,
    name: input.itemName,
    priceCents: input.qty > 0 ? Math.round(input.netCents / input.qty) : input.netCents,
  });
  const [line] = await db
    .insert(posSaleLines)
    .values({
      connectionId: input.connectionId,
      externalLineId: input.externalLineId,
      posItemId,
      qty: input.qty.toFixed(3),
      netCents: String(Math.round(input.netCents)),
      channel: input.channel ?? "in_house",
      soldAt: input.soldAt,
    })
    .returning();
  return { created: true as const, id: line.id };
}

export async function autoMapConnection(
  connectionId: string,
  restaurantId: string,
) {
  const items = await db
    .select()
    .from(posItems)
    .where(eq(posItems.connectionId, connectionId));
  const dishes = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId));
  let linked = 0;
  for (const item of items) {
    const [mapped] = await db
      .select({ id: posItemMappings.id })
      .from(posItemMappings)
      .where(eq(posItemMappings.posItemId, item.id))
      .limit(1);
    if (mapped) continue;
    let best: { id: string; score: number } | null = null;
    for (const dish of dishes) {
      const score = matchConfidence(item.name, dish.name);
      if (!best || score > best.score) best = { id: dish.id, score };
    }
    if (!best || best.score < AUTO_MAP_CONFIDENCE) continue;
    await db.insert(posItemMappings).values({
      posItemId: item.id,
      dishId: best.id,
      confidence: best.score.toFixed(3),
      mappedBy: "auto",
      status: "confirmed",
    });
    linked += 1;
  }
  return linked;
}

export async function theoreticalFromPos(
  restaurantId: string,
  since: Date,
  until = new Date(),
) {
  const sales = await db
    .select({
      qty: posSaleLines.qty,
      posItemId: posSaleLines.posItemId,
    })
    .from(posSaleLines)
    .innerJoin(
      integrationConnections,
      eq(posSaleLines.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.restaurantId, restaurantId),
        gt(posSaleLines.soldAt, since),
        lte(posSaleLines.soldAt, until),
      ),
    );
  const usage: Record<string, number> = {};
  if (!sales.length) return usage;

  const mappings = await db
    .select()
    .from(posItemMappings)
    .where(eq(posItemMappings.status, "confirmed"));
  const mapByItem = new Map(mappings.map((row) => [row.posItemId, row.dishId]));
  const boms = await db
    .select({
      menuItemId: recipeBoms.menuItemId,
      ingredientId: recipeBoms.ingredientId,
      grossQuantity: recipeBoms.grossQuantity,
      yieldPercent: recipeBoms.yieldPercent,
      shrinkage: recipeBoms.shrinkageMarginPercent,
    })
    .from(recipeBoms);
  const ings = await db
    .select({ id: ingredients.id, unit: ingredients.unit })
    .from(ingredients)
    .where(eq(ingredients.restaurantId, restaurantId));
  const unitById = new Map(ings.map((row) => [row.id, row.unit]));
  const bomsByDish = new Map<string, typeof boms>();
  for (const bom of boms) {
    const list = bomsByDish.get(bom.menuItemId) ?? [];
    list.push(bom);
    bomsByDish.set(bom.menuItemId, list);
  }

  for (const sale of sales) {
    const dishId = mapByItem.get(sale.posItemId);
    if (!dishId) continue;
    for (const bom of bomsByDish.get(dishId) ?? []) {
      const unit = unitById.get(bom.ingredientId);
      if (!unit) continue;
      const yieldPct = Math.max(num(bom.yieldPercent), 1);
      const shrink = 1 + num(bom.shrinkage) / 100;
      const raw = num(sale.qty) * num(bom.grossQuantity) * shrink * (100 / yieldPct);
      const converted = convertQty(raw, unit, unit);
      if (converted === null) continue;
      usage[bom.ingredientId] = (usage[bom.ingredientId] ?? 0) + converted;
    }
  }
  return usage;
}

export async function posCoverage(restaurantId: string, since: Date) {
  const sales = await db
    .select({
      qty: posSaleLines.qty,
      posItemId: posSaleLines.posItemId,
    })
    .from(posSaleLines)
    .innerJoin(
      integrationConnections,
      eq(posSaleLines.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.restaurantId, restaurantId),
        gt(posSaleLines.soldAt, since),
      ),
    );
  const mappedIds = new Set(
    (
      await db
        .select({ posItemId: posItemMappings.posItemId })
        .from(posItemMappings)
        .innerJoin(posItems, eq(posItems.id, posItemMappings.posItemId))
        .innerJoin(
          integrationConnections,
          eq(posItems.connectionId, integrationConnections.id),
        )
        .where(
          and(
            eq(integrationConnections.restaurantId, restaurantId),
            eq(posItemMappings.status, "confirmed"),
          ),
        )
    ).map((row) => row.posItemId),
  );
  let total = 0;
  let mapped = 0;
  for (const sale of sales) {
    const qty = num(sale.qty);
    total += qty;
    if (mappedIds.has(sale.posItemId)) mapped += qty;
  }
  return {
    totalQty: total,
    mappedQty: mapped,
    percent: total > 0 ? (mapped / total) * 100 : null,
  };
}
