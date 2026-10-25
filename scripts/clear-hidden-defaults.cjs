/**
 * One-shot: the chef screen used to save a hidden 5% shrinkage and a $1/gram
 * cost whenever a new item was added without a price. Clear those defaults.
 * Runs once. Later edits are left alone.
 */
const postgres = require("postgres");

const FLAG = "clear-hidden-recipe-defaults-2026-10-25";

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
      console.log("→ hidden recipe defaults already cleared");
      return;
    }
    await sql.begin(async (tx) => {
      const shrinkage = await tx`
        update recipe_boms
        set shrinkage_margin_percent = 0
        where shrinkage_margin_percent = 5
      `;
      const costs = await tx`
        update ingredients
        set cost_per_unit = 0
        where cost_per_unit = 1
          and unit = 'G'
          and not exists (
            select 1 from stock_receipts
            where stock_receipts.ingredient_id = ingredients.id
          )
      `;
      await tx`insert into maintenance_flags (key) values (${FLAG})`;
      console.log(
        `→ cleared hidden shrinkage on ${shrinkage.count ?? 0} line(s) and $1/g cost on ${costs.count ?? 0} item(s)`,
      );
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
