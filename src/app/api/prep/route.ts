import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { prepListFor } from "@/lib/prep";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") {
    return jsonError("Only the owner can see the prep list", 403);
  }
  const prep = await prepListFor(session.restaurantId);
  return jsonOk(prep);
}
