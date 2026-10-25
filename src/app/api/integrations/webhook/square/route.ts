import { and, eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api";

function signed(secret: string, body: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!secret || !signed(secret, raw, request.headers.get("x-square-hmacsha256-signature"))) {
    return jsonError("Webhook signature did not match", 401);
  }
  const body = JSON.parse(raw) as {
    merchant_id?: string;
    data?: {
      object?: {
        order_updated?: {
          order_id?: string;
        };
      };
    };
  };
  const merchantId = body.merchant_id;
  if (!merchantId) return jsonOk({ ignored: true });
  const connections = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.provider, "square"),
        eq(integrationConnections.status, "connected"),
      ),
    );
  const { loadCredentials, syncConnection } = await import("@/lib/connectors");
  for (const connection of connections) {
    const creds = await loadCredentials(connection.encryptedTokens);
    if (creds?.merchantId === merchantId) {
      await syncConnection(connection.id);
    }
  }
  return jsonOk({ ok: true, orderId: body.data?.object?.order_updated?.order_id ?? null });
}
