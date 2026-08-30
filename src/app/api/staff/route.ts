import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import {
  createStaffInvite,
  isStaffRole,
  listStaffAndInvites,
} from "@/lib/staff-invite";

export async function GET() {
  try {
    const session = await requireSession(["OWNER"]);
    const data = await listStaffAndInvites(session.restaurantId);
    return jsonOk(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return jsonError("Could not load team", 500);
  }
}

const createSchema = z.object({
  phone: z.string().min(8),
  name: z.string().min(1).optional(),
  role: z.enum(["CHEF", "WAITER", "STOCK_CLERK"]),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(["OWNER"]);
    const body = createSchema.parse(await readJson(request));
    const phone = normalizePhone(body.phone);
    if (!phone) return jsonError("Enter a valid mobile with country code");
    if (!isStaffRole(body.role)) {
      return jsonError("Pick waiter, chef, or stock clerk");
    }

    const result = await createStaffInvite({
      restaurantId: session.restaurantId,
      invitedByUserId: session.id,
      phone,
      name: body.name,
      role: body.role,
    });

    return jsonOk({
      invite: {
        id: result.invite.id,
        phone: result.invite.phone,
        name: result.invite.name,
        role: result.invite.role,
        expiresAt: result.invite.expiresAt,
        link: result.link,
      },
      smsOk: result.sms.ok,
      smsProvider: result.sms.provider,
      link: result.link,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Could not send invite", 500);
  }
}
