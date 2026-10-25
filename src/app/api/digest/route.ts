import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { digestRuns, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { deliverDigest } from "@/lib/digest";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }
  const runs = await db
    .select()
    .from(digestRuns)
    .where(eq(digestRuns.restaurantId, session.restaurantId))
    .orderBy(desc(digestRuns.sentAt))
    .limit(7);
  return jsonOk({ runs });
}

export async function POST() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role === "CHEF") {
    await db
      .update(users)
      .set({ digestOptIn: true })
      .where(eq(users.id, session.id));
    return jsonOk({ optedIn: true });
  }
  if (session.role !== "OWNER") {
    return jsonError("Only the owner receives the daily digest", 403);
  }
  const result = await deliverDigest(session.restaurantId);
  return jsonOk(result);
}
