import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { staffInvites, users } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { isStaffRole } from "@/lib/staff-invite";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  role: z.enum(["CHEF", "WAITER", "STOCK_CLERK"]),
});

/** Owner changes a staff member's role (e.g. Waiter → Chef). */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const session = await requireSession(["OWNER"]);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await readJson(request));
    if (!isStaffRole(body.role)) return jsonError("Invalid role");

    if (id === session.id) {
      return jsonError("You can’t change your own role here");
    }

    const [member] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.restaurantId, session.restaurantId),
          ne(users.role, "OWNER"),
        ),
      )
      .limit(1);

    if (!member) return jsonError("Staff member not found", 404);

    const [updated] = await db
      .update(users)
      .set({ role: body.role })
      .where(eq(users.id, id))
      .returning();

    return jsonOk({ user: updated });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Could not update role", 500);
  }
}

/** Owner removes a staff member — their invite link stops working. */
export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const session = await requireSession(["OWNER"]);
    const { id } = await ctx.params;

    if (id === session.id) {
      return jsonError("You can’t remove yourself");
    }

    const [member] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.restaurantId, session.restaurantId),
          ne(users.role, "OWNER"),
        ),
      )
      .limit(1);

    if (!member) return jsonError("Staff member not found", 404);

    if (member.phone) {
      await db
        .delete(staffInvites)
        .where(
          and(
            eq(staffInvites.restaurantId, session.restaurantId),
            eq(staffInvites.phone, member.phone),
          ),
        );
    }

    await db.delete(users).where(eq(users.id, member.id));

    return jsonOk({ removed: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return jsonError("Could not remove staff", 500);
  }
}
