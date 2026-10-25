/**
 * One-shot removal of the live QA leftovers:
 * pending dishes, QA Garlic, QA Chickpeas, Test Onion,
 * and the Table 7 / Table 12 tickets.
 * Finalized menu dishes are left in place.
 */
const postgres = require("postgres");

const FLAG = "live-test-cleanup-2026-10-25";
const INGREDIENT_NAMES = ["qa garlic", "qa chickpeas", "test onion"];

async function cleanup(sql) {
  const pending = await sql`
    delete from order_items
    where menu_item_id in (
      select id from menu_items
      where menu_approval_status in ('PENDING_APPROVAL', 'DRAFT')
    )
  `;
  const dishes = await sql`
    delete from menu_items
    where menu_approval_status in ('PENDING_APPROVAL', 'DRAFT')
  `;

  const tickets = await sql`
    delete from orders
    where lower(trim(table_number)) in ('7', '12', 'table 7', 'table 12')
  `;

  const ingredients = await sql`
    select id, name from ingredients
    where lower(trim(name)) in ${sql(INGREDIENT_NAMES)}
  `;
  const ingredientIds = ingredients.map((row) => row.id);
  if (ingredientIds.length) {
    await sql`delete from recipe_boms where ingredient_id in ${sql(ingredientIds)}`;
    await sql`delete from stock_receipts where ingredient_id in ${sql(ingredientIds)}`;
    await sql`delete from wastage_logs where ingredient_id in ${sql(ingredientIds)}`;
    await sql`delete from shift_counts where ingredient_id in ${sql(ingredientIds)}`;
    await sql`delete from ingredients where id in ${sql(ingredientIds)}`;
  }

  console.log(
    `→ removed ${dishes.count ?? 0} pending dish(es), ${tickets.count ?? 0} test ticket(s), ${ingredientIds.length} test ingredient(s)`,
  );
  void pending;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    await sql`
      create table if not exists maintenance_flags (
        key text primary key,
        done_at timestamp not null default now()
      )
    `;
    const [already] = await sql`
      select key from maintenance_flags where key = ${FLAG}
    `;
    if (already) {
      console.log("→ test data cleanup already done");
      return;
    }
    await sql.begin(async (tx) => {
      await cleanup(tx);
      await tx`
        insert into maintenance_flags (key) values (${FLAG})
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
