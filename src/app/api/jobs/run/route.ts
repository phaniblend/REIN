import { eq } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { syncStaleConnections } from "@/lib/connectors";
import { deliverDigest, hourInTimezone } from "@/lib/digest";

export async function POST(request: Request) {
  const cron = request.headers.get("x-cron-secret");
  const session = await getSession();
  const allowed =
    (process.env.CRON_SECRET && cron === process.env.CRON_SECRET) ||
    session?.role === "OWNER";
  if (!allowed) return jsonError("Unauthorized", 401);

  const restaurantIds = session
    ? [session.restaurantId]
    : (await db.select({ id: locations.restaurantId }).from(locations)).map((row) => row.id);
  const unique = [...new Set(restaurantIds)];
  for (const restaurantId of unique) {
    await syncStaleConnections(restaurantId);
    const [location] = await db
      .select()
      .from(locations)
      .where(eq(locations.restaurantId, restaurantId))
      .limit(1);
    if (!location) continue;
    if (hourInTimezone(location.timezone) === Number(location.closeHour)) {
      await deliverDigest(restaurantId);
    }
  }
  return jsonOk({ restaurants: unique.length });
}
