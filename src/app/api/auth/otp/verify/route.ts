import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, users } from "@/db/schema";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { consumeOtp } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";

const bodySchema = z.object({
  phone: z.string().min(8),
  code: z.string().min(4).max(8),
  purpose: z.enum(["login", "register"]),
});

type RegisterPayload = {
  restaurantName: string;
  cuisineType: string;
  city: string;
  region: string;
  country: string;
  currency: string;
  ownerName: string;
  email: string | null;
};

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    const phone = normalizePhone(body.phone);
    if (!phone) return jsonError("Invalid phone number");

    const result = await consumeOtp({
      phone,
      code: body.code,
      purpose: body.purpose,
    });
    if (!result.ok) return jsonError(result.error, result.status);

    if (body.purpose === "login") {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);
      if (!user || user.role !== "OWNER") {
        return jsonError("No owner account for that mobile", 404);
      }

      const token = await createSessionToken({
        id: user.id,
        email: user.email ?? "",
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
      });
      await setSessionCookie(token);

      return jsonOk({
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          role: user.role,
          restaurantId: user.restaurantId,
        },
      });
    }

    const payload = result.payload as RegisterPayload | null;
    if (!payload?.restaurantName || !payload.ownerName) {
      return jsonError("Registration session expired — start again", 400);
    }

    const [again] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (again) return jsonError("That mobile is already registered", 409);

    const [restaurant] = await db
      .insert(restaurants)
      .values({
        name: payload.restaurantName,
        cuisineType: payload.cuisineType,
        city: payload.city,
        region: payload.region,
        country: payload.country,
        currency: payload.currency,
      })
      .returning();

    const [owner] = await db
      .insert(users)
      .values({
        restaurantId: restaurant.id,
        name: payload.ownerName,
        email: payload.email,
        phone,
        passwordHash: null,
        role: "OWNER",
      })
      .returning();

    const token = await createSessionToken({
      id: owner.id,
      email: owner.email ?? "",
      name: owner.name,
      role: owner.role,
      restaurantId: owner.restaurantId,
    });
    await setSessionCookie(token);

    return jsonOk({
      user: {
        id: owner.id,
        email: owner.email,
        phone: owner.phone,
        name: owner.name,
        role: owner.role,
        restaurantId: owner.restaurantId,
      },
      restaurant,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Verification failed", 500);
  }
}
