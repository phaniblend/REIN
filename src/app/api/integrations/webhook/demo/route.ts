import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api";
import { ingestSale } from "@/lib/pos-sync";
import { verifyDemoSignature } from "@/lib/token-box";

const schema = z.object({
  connectionId: z.string().uuid(),
  externalLineId: z.string().min(1).max(120),
  externalItemId: z.string().min(1).max(120),
  itemName: z.string().min(1).max(160),
  qty: z.number().positive(),
  netCents: z.number().nonnegative(),
});

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyDemoSignature(raw, request.headers.get("x-restman-signature"))) {
    return jsonError("Webhook signature did not match", 401);
  }

  try {
    const body = schema.parse(JSON.parse(raw));
    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, body.connectionId),
          eq(integrationConnections.provider, "demo"),
          eq(integrationConnections.status, "connected"),
        ),
      )
      .limit(1);
    if (!connection) return jsonError("Connection not found", 404);

    const result = await ingestSale({
      connectionId: connection.id,
      externalLineId: body.externalLineId,
      externalItemId: body.externalItemId,
      itemName: body.itemName,
      qty: body.qty,
      netCents: body.netCents,
      soldAt: new Date(),
    });
    await db
      .update(integrationConnections)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(integrationConnections.id, connection.id));
    return jsonOk(result);
  } catch {
    return jsonError("Could not read the webhook", 400);
  }
}
