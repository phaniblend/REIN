import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { ingredients, wastageLogs } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { binsFor, bumpBin, ensureLocationBins } from "@/lib/active-location";
import { formatUnitCost, num } from "@/lib/utils";
import {
  WASTAGE_KINDS,
  canLogWastageKind,
  wasteDeductsStock,
  wasteLossAmount,
} from "@/lib/wastage";

const schema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive(),
  kind: z.enum(WASTAGE_KINDS).default("KITCHEN_SPOILED"),
  reason: z.string().min(2),
});

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);

  const rows = await db
    .select({
      id: wastageLogs.id,
      ingredientId: wastageLogs.ingredientId,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      quantity: wastageLogs.quantity,
      unitCost: wastageLogs.unitCost,
      shortfall: wastageLogs.shortfall,
      kind: wastageLogs.kind,
      reason: wastageLogs.reason,
      createdAt: wastageLogs.createdAt,
    })
    .from(wastageLogs)
    .innerJoin(ingredients, eq(ingredients.id, wastageLogs.ingredientId))
    .where(eq(wastageLogs.restaurantId, session.restaurantId))
    .orderBy(desc(wastageLogs.createdAt))
    .limit(50);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [week] = await db
    .select({
      loss: sql<string>`coalesce(sum(
        case
          when ${wastageLogs.kind} = 'POS_RETURNED_REUSED' then 0
          when ${wastageLogs.unitCost}::numeric <= 0 then 0
          else greatest(0, ${wastageLogs.quantity}::numeric - ${wastageLogs.shortfall}::numeric)
            * ${wastageLogs.unitCost}::numeric
        end
      ), 0)`,
    })
    .from(wastageLogs)
    .where(
      and(
        eq(wastageLogs.restaurantId, session.restaurantId),
        gte(wastageLogs.createdAt, weekAgo),
      ),
    );

  return jsonOk({
    wastage: rows.map((row) => {
      const loss = wasteLossAmount({
        quantity: num(row.quantity),
        shortfall: num(row.shortfall),
        unitCost: num(row.unitCost),
        kind: row.kind,
      });
      return {
        ...row,
        loss: loss === null ? null : loss.toFixed(2),
      };
    }),
    weekLoss: num(week?.loss).toFixed(2),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK", "WAITER"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const body = schema.parse(await readJson(request));
    if (!canLogWastageKind(session.role, body.kind)) {
      return jsonError(
        session.role === "WAITER"
          ? "Waiters can only log returned waste"
          : "Forbidden",
        403,
      );
    }

    const [ing] = await db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.id, body.ingredientId),
          eq(ingredients.restaurantId, session.restaurantId),
        ),
      )
      .limit(1);
    if (!ing) return jsonError("Ingredient not found", 404);

    const location = await ensureLocationBins(session.restaurantId);
    const bins = await binsFor(location.id);
    const onHand = bins.get(ing.id) ?? num(ing.currentStock);
    const deducts = wasteDeductsStock(body.kind);
    const shortfall = deducts ? Math.max(0, body.quantity - onHand) : 0;
    const deductQty = deducts ? body.quantity - shortfall : 0;

    const [log] = await db
      .insert(wastageLogs)
      .values({
        restaurantId: session.restaurantId,
        ingredientId: body.ingredientId,
        loggedBy: session.id,
        quantity: body.quantity.toFixed(3),
        unitCost: formatUnitCost(num(ing.costPerUnit)),
        shortfall: shortfall.toFixed(3),
        kind: body.kind,
        reason: body.reason,
        locationId: location.id,
      })
      .returning();

    if (deductQty > 0) {
      await bumpBin(location.id, ing.id, -deductQty);
    }

    return jsonOk(
      {
        wastage: log,
        shortfall,
        warned: shortfall > 0,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to log wastage", 500);
  }
}
