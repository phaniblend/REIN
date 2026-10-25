import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodSafetyLogs, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { activeLocation } from "@/lib/active-location";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: foodSafetyLogs.id,
      kind: foodSafetyLogs.kind,
      reading: foodSafetyLogs.reading,
      note: foodSafetyLogs.note,
      photo: foodSafetyLogs.photo,
      createdAt: foodSafetyLogs.createdAt,
      userName: users.name,
    })
    .from(foodSafetyLogs)
    .innerJoin(users, eq(foodSafetyLogs.userId, users.id))
    .where(
      and(
        eq(foodSafetyLogs.restaurantId, session.restaurantId),
        gte(foodSafetyLogs.createdAt, since),
      ),
    )
    .orderBy(desc(foodSafetyLogs.createdAt));
  return jsonOk({ logs: rows });
}

const schema = z.object({
  kind: z.enum(["fridge_temp", "checklist"]),
  reading: z.string().min(1).max(80),
  note: z.string().max(300).optional(),
  photo: z.string().max(700_000).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  const body = schema.parse(await readJson(request));
  const location = await activeLocation(session.restaurantId);
  const [log] = await db
    .insert(foodSafetyLogs)
    .values({
      restaurantId: session.restaurantId,
      locationId: location.id,
      userId: session.id,
      kind: body.kind,
      reading: body.reading.trim(),
      note: body.note?.trim(),
      photo: body.photo,
    })
    .returning();
  return jsonOk({ log }, { status: 201 });
}
