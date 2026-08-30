import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import {
  createSessionToken,
  setSessionCookie,
  type UserRole,
} from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { acceptStaffInvite, getInviteByToken } from "@/lib/staff-invite";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const invite = await getInviteByToken(token);
    if (!invite) return jsonError("Invite not found", 404);
    if (invite.acceptedAt) return jsonError("Invite already used", 409);
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return jsonError("Invite expired", 410);
    }

    const [restaurant] = await db
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, invite.restaurantId))
      .limit(1);

    return jsonOk({
      phone: invite.phone,
      name: invite.name,
      role: invite.role,
      restaurantName: restaurant?.name ?? "Restaurant",
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    console.error(err);
    return jsonError("Could not load invite", 500);
  }
}

const acceptSchema = z.object({
  name: z.string().min(2),
});

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const body = acceptSchema.parse(await readJson(request));
    const result = await acceptStaffInvite({ token, name: body.name });
    if (!result.ok) return jsonError(result.error, result.status);

    const jwt = await createSessionToken({
      id: result.user.id,
      email: result.user.email ?? "",
      name: result.user.name,
      role: result.role as UserRole,
      restaurantId: result.user.restaurantId,
    });
    await setSessionCookie(jwt);

    return jsonOk({
      user: {
        id: result.user.id,
        name: result.user.name,
        phone: result.user.phone,
        role: result.user.role,
        restaurantId: result.user.restaurantId,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Could not accept invite", 500);
  }
}
