import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { dishFoodCosts, TARGET_PERCENT } from "@/lib/food-cost";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Only the owner and chef can see food cost", 403);
  }
  const costs = await dishFoodCosts(session.restaurantId);
  return jsonOk({ targetPercent: TARGET_PERCENT, costs });
}
