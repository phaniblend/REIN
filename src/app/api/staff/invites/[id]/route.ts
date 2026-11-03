import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { cancelStaffInvite } from "@/lib/staff-invite";

type Ctx = { params: Promise<{ id: string }> };

/** Owner cancels a pending invite so the link stops working. */
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const session = await requireSession(["OWNER"]);
    const { id } = await ctx.params;
    const invite = await cancelStaffInvite(session.restaurantId, id);
    if (!invite) return jsonError("Invite not found", 404);
    return jsonOk({ cancelled: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return jsonError("Could not cancel invite", 500);
  }
}
