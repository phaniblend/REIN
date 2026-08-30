import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { menuItems, orderItems } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  sellingPrice: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  action: z.enum(["approve", "reject"]).optional(),
});

async function getOwnedItem(id: string, restaurantId: string) {
  const [item] = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, restaurantId)))
    .limit(1);
  return item ?? null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  const { id } = await context.params;

  try {
    const body = patchSchema.parse(await readJson(request));
    const existing = await getOwnedItem(id, session.restaurantId);
    if (!existing) return jsonError("Menu item not found", 404);

    const updates: Partial<typeof menuItems.$inferInsert> = {};

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.category !== undefined) updates.category = body.category.trim();
    if (body.sellingPrice !== undefined) {
      updates.sellingPrice = body.sellingPrice.toFixed(2);
    }
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    if (body.action === "approve") {
      updates.menuApprovalStatus = "APPROVED";
      updates.recipeApprovalStatus = "APPROVED";
      updates.ownerApprovedAt = new Date();
      updates.isActive = true;
    } else if (body.action === "reject") {
      updates.menuApprovalStatus = "REJECTED";
      updates.recipeApprovalStatus = "REJECTED";
      updates.isActive = false;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("No changes provided");
    }

    const [menuItem] = await db
      .update(menuItems)
      .set(updates)
      .where(eq(menuItems.id, id))
      .returning();

    return jsonOk({ menuItem });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Failed to update menu item", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  const { id } = await context.params;
  const existing = await getOwnedItem(id, session.restaurantId);
  if (!existing) return jsonError("Menu item not found", 404);

  const [used] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.menuItemId, id))
    .limit(1);

  if (used) {
    const [menuItem] = await db
      .update(menuItems)
      .set({ isActive: false })
      .where(eq(menuItems.id, id))
      .returning();
    return jsonOk({ menuItem, softDeleted: true });
  }

  await db.delete(menuItems).where(eq(menuItems.id, id));
  return jsonOk({ deleted: true });
}
