import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { menuItems } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

/**
 * Re-open recipes for chef when owner previously finalized menu+recipe together.
 * Only touches dishes the chef has never signed.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "CHEF") {
    return jsonError("Only the chef can reopen recipes", 403);
  }

  try {
    const updated = await db
      .update(menuItems)
      .set({ recipeApprovalStatus: "PENDING_APPROVAL" })
      .where(
        and(
          eq(menuItems.restaurantId, session.restaurantId),
          eq(menuItems.menuApprovalStatus, "APPROVED"),
          eq(menuItems.recipeApprovalStatus, "APPROVED"),
          isNull(menuItems.chefSignedAt),
        ),
      )
      .returning({ id: menuItems.id });

    return jsonOk({ reopened: updated.length });
  } catch (err) {
    console.error(err);
    return jsonError("Could not prepare chef recipe queue", 500);
  }
}
