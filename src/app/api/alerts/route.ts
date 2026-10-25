import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }
  const rows = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.restaurantId, session.restaurantId), isNull(alerts.readAt)))
    .orderBy(desc(alerts.createdAt))
    .limit(20);
  return jsonOk({ alerts: rows });
}

const schema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) return jsonError("Forbidden", 403);
  const body = schema.parse(await readJson(request));
  await db
    .update(alerts)
    .set({ readAt: new Date() })
    .where(and(eq(alerts.id, body.id), eq(alerts.restaurantId, session.restaurantId)));
  return jsonOk({ ok: true });
}
