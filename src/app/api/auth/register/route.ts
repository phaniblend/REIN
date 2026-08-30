import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, users } from "@/db/schema";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";

const bodySchema = z.object({
  restaurantName: z.string().min(2),
  cuisineType: z.string().min(2),
  city: z.string().min(2),
  region: z.string().optional().default(""),
  country: z.string().min(2).default("US"),
  currency: z.string().min(3).max(3).default("USD"),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));

    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase()),
    });
    if (existing) return jsonError("Email already registered", 409);

    const [restaurant] = await db
      .insert(restaurants)
      .values({
        name: body.restaurantName,
        cuisineType: body.cuisineType,
        city: body.city,
        region: body.region,
        country: body.country,
        currency: body.currency,
      })
      .returning();

    const passwordHash = await hashPassword(body.password);
    const [owner] = await db
      .insert(users)
      .values({
        restaurantId: restaurant.id,
        name: body.ownerName,
        email: body.email.toLowerCase(),
        passwordHash,
        role: "OWNER",
      })
      .returning();

    const token = await createSessionToken({
      id: owner.id,
      email: owner.email,
      name: owner.name,
      role: owner.role,
      restaurantId: owner.restaurantId,
    });
    await setSessionCookie(token);

    return jsonOk({
      user: {
        id: owner.id,
        email: owner.email,
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
    return jsonError("Registration failed", 500);
  }
}
