import { and, eq } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api";
import { ingestSale } from "@/lib/pos-sync";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.DELIVERECT_SECRET;
  if (!secret) return jsonError("Delivery webhook is not configured", 409);
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const signature = request.headers.get("x-server-authorization-hmac-sha256") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return jsonError("Webhook signature did not match", 401);
  }
  const body = JSON.parse(raw) as {
    connectionId?: string;
    channel?: string;
    items?: { plu?: string; name?: string; quantity?: number; price?: number }[];
  };
  const [connection] = body.connectionId
    ? await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.id, body.connectionId),
            eq(integrationConnections.provider, "deliverect"),
            eq(integrationConnections.status, "connected"),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.provider, "deliverect"),
            eq(integrationConnections.status, "connected"),
          ),
        )
        .limit(1);
  if (!connection) return jsonError("No delivery connection", 404);
  const stamp = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  let created = 0;
  for (const [index, item] of (body.items ?? []).entries()) {
    const name = item.name || "Delivery item";
    const qty = item.quantity ?? 1;
    const result = await ingestSale({
      connectionId: connection.id,
      externalLineId: `${stamp}:${index}`,
      externalItemId: item.plu || name,
      itemName: name,
      qty,
      netCents: Math.round((item.price ?? 0) * 100),
      soldAt: new Date(),
      channel: "delivery",
    });
    if (result.created) created += 1;
  }
  await db
    .update(integrationConnections)
    .set({ lastSyncedAt: new Date(), lastError: null })
    .where(eq(integrationConnections.id, connection.id));
  return jsonOk({ created });
}
