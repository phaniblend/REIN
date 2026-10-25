/**
 * Creates the two flagged test restaurants. Keep emails in sync with
 * src/lib/test-login-accounts.ts.
 */
const postgres = require("postgres");
const bcrypt = require("bcryptjs");

const PASSWORD = "RestmanTest1";
const KITCHENS = [
  {
    name: "Restman Test Kitchen",
    city: "Chicago",
    region: "IL",
    logins: [
      ["OWNER", "Test Owner", "owner@test.restman.live", "+15555550101"],
      ["CHEF", "Test Chef", "chef@test.restman.live", "+15555550102"],
      ["WAITER", "Test Waiter", "waiter@test.restman.live", "+15555550103"],
      ["STOCK_CLERK", "Test Stock", "stock@test.restman.live", "+15555550104"],
    ],
  },
  {
    name: "Restman Isolation Kitchen",
    city: "Austin",
    region: "TX",
    logins: [
      ["OWNER", "Isolation Owner", "owner@isolation.restman.live", "+15555550201"],
      ["CHEF", "Isolation Chef", "chef@isolation.restman.live", "+15555550202"],
      ["WAITER", "Isolation Waiter", "waiter@isolation.restman.live", "+15555550203"],
      ["STOCK_CLERK", "Isolation Stock", "stock@isolation.restman.live", "+15555550204"],
    ],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  try {
    for (const kitchen of KITCHENS) {
      const [existing] = await sql`
        select id from restaurants where name = ${kitchen.name} limit 1
      `;
      let restaurantId = existing?.id;
      if (!restaurantId) {
        const [created] = await sql`
          insert into restaurants (name, cuisine_type, city, region, country, currency, is_test)
          values (${kitchen.name}, 'Indian', ${kitchen.city}, ${kitchen.region}, 'US', 'USD', true)
          returning id
        `;
        restaurantId = created.id;
      } else {
        await sql`update restaurants set is_test = true where id = ${restaurantId}`;
      }
      for (const [role, name, email, phone] of kitchen.logins) {
        const [user] = await sql`select id from users where email = ${email} limit 1`;
        if (user) {
          await sql`
            update users
            set restaurant_id = ${restaurantId},
                name = ${name},
                phone = ${phone},
                password_hash = ${passwordHash},
                role = ${role}
            where id = ${user.id}
          `;
        } else {
          await sql`
            insert into users (restaurant_id, name, email, phone, password_hash, role)
            values (${restaurantId}, ${name}, ${email}, ${phone}, ${passwordHash}, ${role})
          `;
        }
      }
    }
    console.log("→ test kitchens ready");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
