import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { menuItems } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

/** Approve all draft/pending menu items for POS use. */
export async function POST() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  try {
    const updated = await db
      .update(menuItems)
      .set({
        menuApprovalStatus: "APPROVED",
        recipeApprovalStatus: "APPROVED",
        ownerApprovedAt: new Date(),
        isActive: true,
      })
      .where(
        and(
          eq(menuItems.restaurantId, session.restaurantId),
          ne(menuItems.menuApprovalStatus, "APPROVED"),
          ne(menuItems.menuApprovalStatus, "REJECTED"),
        ),
      )
      .returning({ id: menuItems.id });

    return jsonOk({ finalized: updated.length });
  } catch (err) {
    console.error(err);
    return jsonError("Failed to finalize menu", 500);
  }
}
