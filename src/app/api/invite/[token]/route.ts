import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import {
  createSessionToken,
  homePathForRole,
  setSessionCookie,
  type UserRole,
} from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import {
  acceptStaffInvite,
  continueStaffInvite,
  getInviteByToken,
} from "@/lib/staff-invite";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const invite = await getInviteByToken(token);
    if (!invite) return jsonError("Invite not found", 404);

    const [restaurant] = await db
      .select({ name: restaurants.name })
      .from(restaurants)
      .where(eq(restaurants.id, invite.restaurantId))
      .limit(1);

    if (invite.acceptedAt) {
      return jsonOk({
        status: "accepted" as const,
        phone: invite.phone,
        name: invite.name,
        role: invite.role,
        restaurantName: restaurant?.name ?? "Restaurant",
        canContinue: true,
      });
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return jsonError("Invite expired", 410);
    }

    return jsonOk({
      status: "pending" as const,
      phone: invite.phone,
      name: invite.name,
      role: invite.role,
      restaurantName: restaurant?.name ?? "Restaurant",
      expiresAt: invite.expiresAt,
      canContinue: false,
    });
  } catch (err) {
    console.error(err);
    return jsonError("Could not load invite", 500);
  }
}

const bodySchema = z.object({
  name: z.string().min(2).optional(),
  action: z.enum(["accept", "continue"]).default("accept"),
});

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const body = bodySchema.parse(await readJson(request));

    const result =
      body.action === "continue"
        ? await continueStaffInvite(token)
        : await acceptStaffInvite({
            token,
            name: body.name?.trim() || "Staff",
          });

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
      redirectTo: homePathForRole(result.user.role),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Could not accept invite", 500);
  }
}
