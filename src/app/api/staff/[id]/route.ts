import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { staffInvites, users } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

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

    // Wipe invites for this phone so the old link cannot sign them back in.
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
