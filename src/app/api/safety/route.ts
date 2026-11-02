import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodSafetyLogs, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { activeLocation } from "@/lib/active-location";

const KITCHEN_ROLES = ["OWNER", "CHEF", "WAITER", "STOCK_CLERK"] as const;

/** Parse "45 F" / "7 C" style fridge readings. */
export function parseFridgeReading(raw: string): {
  value: number;
  unit: "F" | "C";
} | null {
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([FC])\b/i);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: match[2]!.toUpperCase() as "F" | "C",
  };
}

export function fridgeReadingUnsafe(raw: string) {
  const parsed = parseFridgeReading(raw);
  if (!parsed) return null;
  if (parsed.unit === "F") return parsed.value > 41;
  return parsed.value > 5;
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!(KITCHEN_ROLES as readonly string[]).includes(session.role)) {
    return jsonError("Forbidden", 403);
  }
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
  if (!(KITCHEN_ROLES as readonly string[]).includes(session.role)) {
    return jsonError("Only kitchen staff can log food safety", 403);
  }
  const body = schema.parse(await readJson(request));
  const unsafe =
    body.kind === "fridge_temp" ? fridgeReadingUnsafe(body.reading) : false;
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
  return jsonOk(
    {
      log,
      warning:
        unsafe === true
          ? "Fridge reading is above 41°F / 5°C. Fix the cooler before service."
          : unsafe === null && body.kind === "fridge_temp"
            ? "Use a number with F or C, for example 38 F."
            : null,
    },
    { status: 201 },
  );
}
