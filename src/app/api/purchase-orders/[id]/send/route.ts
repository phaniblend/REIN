import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { sendPurchaseOrder } from "@/app/api/purchase-orders/route";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") {
    return jsonError("Only the owner can send a purchase order", 403);
  }
  const { id } = await context.params;
  const result = await sendPurchaseOrder(id, session.restaurantId, session.id);
  if ("error" in result && result.error) return jsonError(result.error, result.status);
  return jsonOk({ message: result.message, channel: result.channel });
}
