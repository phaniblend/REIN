import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  integrationConnections,
  posSaleLines,
  staffShifts,
  users,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { ApiClientError, jsonError, jsonOk, readJson } from "@/lib/api";
import { dishFoodCosts } from "@/lib/food-cost";
import { activeLocation } from "@/lib/active-location";
import { num } from "@/lib/utils";

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can see labor", 403);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const shifts = await db
    .select({
      id: staffShifts.id,
      userId: staffShifts.userId,
      name: users.name,
      startsAt: staffShifts.startsAt,
      endsAt: staffShifts.endsAt,
      hourlyRateCents: staffShifts.hourlyRateCents,
      locationId: staffShifts.locationId,
    })
    .from(staffShifts)
    .innerJoin(users, eq(staffShifts.userId, users.id))
    .where(
      and(eq(staffShifts.restaurantId, session.restaurantId), gte(staffShifts.startsAt, start)),
    );
  const staff = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.restaurantId, session.restaurantId));
  let laborCents = 0;
  for (const shift of shifts) {
    const hours =
      (new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) / 36e5;
    laborCents += Math.max(hours, 0) * num(shift.hourlyRateCents);
  }
  const sales = await db
    .select({ netCents: posSaleLines.netCents })
    .from(posSaleLines)
    .innerJoin(
      integrationConnections,
      eq(posSaleLines.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.restaurantId, session.restaurantId),
        gte(posSaleLines.soldAt, start),
      ),
    );
  const salesCents = sales.reduce((sum, row) => sum + num(row.netCents), 0);
  const costs = await dishFoodCosts(session.restaurantId);
  const percents = costs
    .map((row) => row.foodCostPercent)
    .filter((value): value is number => value !== null);
  const foodPercent =
    percents.length > 0
      ? percents.reduce((sum, value) => sum + value, 0) / percents.length
      : 0;
  const laborPercent = salesCents > 0 ? (laborCents / salesCents) * 100 : 0;
  return jsonOk({
    shifts,
    staff,
    laborCents,
    salesCents,
    foodPercent,
    laborPercent,
    primePercent: salesCents > 0 ? foodPercent + laborPercent : 0,
    hasSales: salesCents > 0,
  });
}

const schema = z
  .object({
    userId: z.string().uuid(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    hourlyRate: z.number().nonnegative(),
  })
  .strict();

const deleteSchema = z.object({ id: z.string().uuid() }).strict();

const patchSchema = z
  .object({
    id: z.string().uuid(),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    hourlyRate: z.number().nonnegative(),
  })
  .strict();

function scheduleClientError(err: unknown, fallback: string) {
  if (err instanceof ApiClientError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof z.ZodError) {
    return jsonError(err.issues[0]?.message ?? "Invalid input", 400);
  }
  console.error(err);
  return jsonError(fallback, 500);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can schedule staff", 403);
  try {
    const body = schema.parse(await readJson(request));
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return jsonError("Enter a valid start and end time", 400);
    }
    if (!(endsAt > startsAt)) return jsonError("End time has to be after the start", 400);
    const [person] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, body.userId), eq(users.restaurantId, session.restaurantId)))
      .limit(1);
    if (!person) return jsonError("Staff member not found", 404);
    const location = await activeLocation(session.restaurantId);
    const [shift] = await db
      .insert(staffShifts)
      .values({
        restaurantId: session.restaurantId,
        locationId: location.id,
        userId: person.id,
        startsAt,
        endsAt,
        hourlyRateCents: String(Math.round(body.hourlyRate * 100)),
      })
      .returning();
    return jsonOk({ shift }, { status: 201 });
  } catch (err) {
    return scheduleClientError(err, "Could not save the shift");
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can change the schedule", 403);
  try {
    const body = deleteSchema.parse(await readJson(request));
    const [shift] = await db
      .select()
      .from(staffShifts)
      .where(
        and(
          eq(staffShifts.id, body.id),
          eq(staffShifts.restaurantId, session.restaurantId),
        ),
      )
      .limit(1);
    if (!shift) return jsonError("Shift not found", 404);
    await db.delete(staffShifts).where(eq(staffShifts.id, shift.id));
    return jsonOk({ deleted: true });
  } catch (err) {
    return scheduleClientError(err, "Could not delete the shift");
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") return jsonError("Only the owner can change the schedule", 403);
  try {
    const body = patchSchema.parse(await readJson(request));
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return jsonError("Enter a valid start and end time", 400);
    }
    if (!(endsAt > startsAt)) return jsonError("End time has to be after the start", 400);
    const [shift] = await db
      .select()
      .from(staffShifts)
      .where(
        and(
          eq(staffShifts.id, body.id),
          eq(staffShifts.restaurantId, session.restaurantId),
        ),
      )
      .limit(1);
    if (!shift) return jsonError("Shift not found", 404);
    const [updated] = await db
      .update(staffShifts)
      .set({
        startsAt,
        endsAt,
        hourlyRateCents: String(Math.round(body.hourlyRate * 100)),
      })
      .where(eq(staffShifts.id, shift.id))
      .returning();
    return jsonOk({ shift: updated });
  } catch (err) {
    return scheduleClientError(err, "Could not update the shift");
  }
}
