import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { TEST_LOGINS, TEST_PASSWORD } from "@/lib/test-login-accounts";

const TEST_RESTAURANT = "Restman Test Kitchen";

/** Create the shared test kitchen and keep these four logins in sync. */
export async function ensureTestLogins() {
  let [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.name, TEST_RESTAURANT))
    .limit(1);

  if (!restaurant) {
    [restaurant] = await db
      .insert(restaurants)
      .values({
        name: TEST_RESTAURANT,
        cuisineType: "Indian",
        city: "Chicago",
        region: "IL",
        country: "US",
        currency: "USD",
      })
      .returning();
  }

  const passwordHash = await hashPassword(TEST_PASSWORD);

  for (const login of TEST_LOGINS) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, login.email))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({
          restaurantId: restaurant.id,
          name: login.name,
          phone: login.phone,
          passwordHash,
          role: login.role,
        })
        .where(eq(users.id, existing.id));
      continue;
    }

    await db.insert(users).values({
      restaurantId: restaurant.id,
      name: login.name,
      email: login.email,
      phone: login.phone,
      passwordHash,
      role: login.role,
    });
  }

  return restaurant;
}
