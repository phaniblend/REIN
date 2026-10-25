import { eq } from "drizzle-orm";
import { db } from "@/db";
import { restaurants, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { TEST_KITCHENS, TEST_PASSWORD } from "@/lib/test-login-accounts";

/** Keep both flagged test restaurants and their logins in sync. */
export async function ensureTestLogins() {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const created = [];

  for (const kitchen of TEST_KITCHENS) {
    let [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.name, kitchen.name))
      .limit(1);

    if (!restaurant) {
      [restaurant] = await db
        .insert(restaurants)
        .values({
          name: kitchen.name,
          cuisineType: "Indian",
          city: kitchen.city,
          region: kitchen.region,
          country: "US",
          currency: "USD",
          isTest: true,
        })
        .returning();
    } else if (!restaurant.isTest) {
      await db
        .update(restaurants)
        .set({ isTest: true })
        .where(eq(restaurants.id, restaurant.id));
    }

    for (const login of kitchen.logins) {
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

    created.push(restaurant);
  }

  return created;
}
