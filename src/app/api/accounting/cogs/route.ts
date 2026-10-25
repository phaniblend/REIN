import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { accountingExports, integrationConnections, posSaleLines } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { loadCredentials, pushQuickBooksJournal } from "@/lib/connectors";
import { cogsCents } from "@/lib/cogs";
import { dishFoodCosts } from "@/lib/food-cost";
import { num } from "@/lib/utils";

export async function POST() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") {
    return jsonError("Only the owner can post cost of goods", 403);
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const sales = await db
    .select({ netCents: posSaleLines.netCents })
    .from(posSaleLines)
    .innerJoin(
      integrationConnections,
      eq(posSaleLines.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.restaurantId, session.restaurantId),
        gte(posSaleLines.soldAt, start),
      ),
    );
  const salesCents = sales.reduce((sum, row) => sum + num(row.netCents), 0);
  const costs = await dishFoodCosts(session.restaurantId);
  const percents = costs
    .map((row) => row.foodCostPercent)
    .filter((value): value is number => value !== null);
  const foodPercent =
    percents.length > 0
      ? percents.reduce((sum, value) => sum + value, 0) / percents.length
      : 0;
  const amountCents = cogsCents(salesCents, foodPercent);
  const payload = {
    kind: "cogs",
    salesCents,
    foodPercent,
    amountCents,
    day: start.toISOString().slice(0, 10),
  };
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.restaurantId, session.restaurantId),
        eq(integrationConnections.provider, "quickbooks"),
        eq(integrationConnections.status, "connected"),
      ),
    )
    .limit(1);
  let status = "queued";
  let externalId: string | null = null;
  if (connection && amountCents > 0) {
    const creds = await loadCredentials(connection.encryptedTokens);
    if (creds?.realmId) {
      externalId = await pushQuickBooksJournal(creds, {
        amount: amountCents / 100,
        note: `Restman food cost ${payload.day}`,
      });
      status = "sent";
    }
  }
  const [row] = await db
    .insert(accountingExports)
    .values({
      restaurantId: session.restaurantId,
      provider: "quickbooks",
      status,
      payload: JSON.stringify(payload),
      externalId,
    })
    .returning();
  return jsonOk({ export: row, amountCents });
}
