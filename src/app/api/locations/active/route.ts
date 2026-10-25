import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const schema = z.object({ locationId: z.string().uuid() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can switch locations", 403);
  const body = schema.parse(await readJson(request));
  const [row] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, body.locationId))
    .limit(1);
  if (!row || row.restaurantId !== session.restaurantId) {
    return jsonError("Location not found", 404);
  }
  const jar = await cookies();
  jar.set("rm_location", row.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return jsonOk({ location: row });
}
