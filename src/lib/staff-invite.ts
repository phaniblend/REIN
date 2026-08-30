import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, staffInvites, users } from "@/db/schema";
import type { UserRole } from "@/lib/auth";
import { sendSms } from "@/lib/sms";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const STAFF_ROLES = ["CHEF", "WAITER", "STOCK_CLERK"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function createInviteToken() {
  return randomBytes(24).toString("base64url");
}

export function appBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null) ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export async function createStaffInvite(opts: {
  restaurantId: string;
  invitedByUserId: string;
  phone: string;
  name?: string;
  role: StaffRole;
}) {
  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db
    .update(staffInvites)
    .set({ expiresAt: new Date() })
    .where(
      and(
        eq(staffInvites.restaurantId, opts.restaurantId),
        eq(staffInvites.phone, opts.phone),
        isNull(staffInvites.acceptedAt),
      ),
    );

  const [invite] = await db
    .insert(staffInvites)
    .values({
      restaurantId: opts.restaurantId,
      invitedByUserId: opts.invitedByUserId,
      phone: opts.phone,
      name: opts.name ?? null,
      role: opts.role,
      token,
      expiresAt,
    })
    .returning();

  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, opts.restaurantId))
    .limit(1);

  const link = `${appBaseUrl()}/invite/${token}`;
  const roleLabel = opts.role.toLowerCase().replace("_", " ");
  const sms = await sendSms(
    opts.phone,
    `${restaurant?.name ?? "Your restaurant"} invited you as ${roleLabel} on Restman. Open: ${link}`,
  );

  return {
    invite,
    link,
    sms,
    restaurantName: restaurant?.name ?? "Restaurant",
  };
}

export async function listStaffAndInvites(restaurantId: string) {
  const team = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.restaurantId, restaurantId))
    .orderBy(desc(users.createdAt));

  const invites = await db
    .select()
    .from(staffInvites)
    .where(
      and(
        eq(staffInvites.restaurantId, restaurantId),
        isNull(staffInvites.acceptedAt),
      ),
    )
    .orderBy(desc(staffInvites.createdAt));

  const now = Date.now();
  return {
    team,
    invites: invites
      .filter((i) => new Date(i.expiresAt).getTime() > now)
      .map((i) => ({
        id: i.id,
        phone: i.phone,
        name: i.name,
        role: i.role,
        expiresAt: i.expiresAt,
        link: `${appBaseUrl()}/invite/${i.token}`,
      })),
  };
}

export async function getInviteByToken(token: string) {
  const [invite] = await db
    .select()
    .from(staffInvites)
    .where(eq(staffInvites.token, token))
    .limit(1);
  return invite ?? null;
}

export async function acceptStaffInvite(opts: {
  token: string;
  name: string;
}): Promise<
  | { ok: true; user: typeof users.$inferSelect; role: UserRole }
  | { ok: false; error: string; status: number }
> {
  const invite = await getInviteByToken(opts.token);
  if (!invite) return { ok: false, error: "Invite not found", status: 404 };

  // Already joined — resume that staff account (same invite link = permanent access).
  if (invite.acceptedAt) {
    return resumeAcceptedInvite(invite);
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return {
      ok: false,
      error: "Invite expired — ask your owner for a new link",
      status: 410,
    };
  }
  if (!isStaffRole(invite.role)) {
    return { ok: false, error: "Invalid invite role", status: 400 };
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.phone, invite.phone))
    .limit(1);
  if (existing) {
    // Phone already joined this restaurant — bind invite + resume.
    if (existing.restaurantId === invite.restaurantId) {
      await db
        .update(staffInvites)
        .set({ acceptedAt: new Date(), acceptedUserId: existing.id })
        .where(eq(staffInvites.id, invite.id));
      return { ok: true, user: existing, role: existing.role as UserRole };
    }
    return {
      ok: false,
      error: "This mobile already has an account — sign in instead",
      status: 409,
    };
  }

  const [user] = await db
    .insert(users)
    .values({
      restaurantId: invite.restaurantId,
      name: opts.name.trim() || invite.name || "Staff",
      phone: invite.phone,
      email: null,
      passwordHash: null,
      role: invite.role,
    })
    .returning();

  await db
    .update(staffInvites)
    .set({ acceptedAt: new Date(), acceptedUserId: user.id })
    .where(eq(staffInvites.id, invite.id));

  return { ok: true, user, role: invite.role as UserRole };
}

async function resumeAcceptedInvite(invite: typeof staffInvites.$inferSelect) {
  let user: typeof users.$inferSelect | undefined;

  if (invite.acceptedUserId) {
    const [byId] = await db
      .select()
      .from(users)
      .where(eq(users.id, invite.acceptedUserId))
      .limit(1);
    user = byId;
  }

  if (!user) {
    const [byPhone] = await db
      .select()
      .from(users)
      .where(eq(users.phone, invite.phone))
      .limit(1);
    user = byPhone;
  }

  if (!user || user.restaurantId !== invite.restaurantId) {
    return {
      ok: false as const,
      error: "This invite is no longer valid — ask your owner for a new one",
      status: 410,
    };
  }

  return { ok: true as const, user, role: user.role as UserRole };
}

/** Open an already-accepted invite and sign that staff member back in. */
export async function continueStaffInvite(token: string) {
  const invite = await getInviteByToken(token);
  if (!invite) return { ok: false as const, error: "Invite not found", status: 404 };
  if (!invite.acceptedAt) {
    return {
      ok: false as const,
      error: "Invite not accepted yet — join first",
      status: 400,
    };
  }
  return resumeAcceptedInvite(invite);
}
