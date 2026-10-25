/**
 * Collapse duplicate dish and ingredient names left by earlier menu runs.
 * Keeps the finalized / signed / oldest row, repoints tickets and stock, then deletes the rest.
 */
const postgres = require("postgres");

function menuRank(item) {
  let rank = 0;
  if (item.menu_approval_status === "APPROVED") rank += 4;
  if (item.chef_signed_at) rank += 2;
  if (item.is_active) rank += 1;
  return rank;
}

async function dedupeMenu(sql, restaurantId) {
  const items = await sql`
    select id, name, menu_approval_status, chef_signed_at, is_active, created_at
    from menu_items
    where restaurant_id = ${restaurantId}
    order by created_at asc
  `;
  const groups = new Map();
  for (const item of items) {
    const key = String(item.name ?? "").trim().toLowerCase();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      const byRank = menuRank(b) - menuRank(a);
      if (byRank !== 0) return byRank;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    const keeper = list[0];
    const losers = list.slice(1).map((item) => item.id);
    const [bom] = await sql`
      select id from recipe_boms where menu_item_id = ${keeper.id} limit 1
    `;
    if (!bom) {
      await sql`
        update recipe_boms
        set menu_item_id = ${keeper.id}
        where menu_item_id = ${losers[0]}
      `;
    }
    await sql`
      update order_items
      set menu_item_id = ${keeper.id}
      where menu_item_id in ${sql(losers)}
    `;
    await sql`delete from menu_items where id in ${sql(losers)}`;
    removed += losers.length;
  }
  return removed;
}

async function dedupeIngredients(sql, restaurantId) {
  const items = await sql`
    select id, name, unit, current_stock, created_at
    from ingredients
    where restaurant_id = ${restaurantId}
    order by created_at asc
  `;
  const groups = new Map();
  for (const item of items) {
    const key = `${String(item.name ?? "").trim().toLowerCase()}|${item.unit}`;
    if (key.startsWith("|")) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keeper = list[0];
    const ids = list.map((item) => item.id);
    const losers = ids.slice(1);
    await sql`
      update ingredients
      set current_stock = (
        select coalesce(sum(current_stock), 0)
        from ingredients
        where id in ${sql(ids)}
      )
      where id = ${keeper.id}
    `;
    await sql`
      update recipe_boms
      set ingredient_id = ${keeper.id}
      where ingredient_id in ${sql(losers)}
    `;
    await sql`
      update stock_receipts
      set ingredient_id = ${keeper.id}
      where ingredient_id in ${sql(losers)}
    `;
    await sql`
      update wastage_logs
      set ingredient_id = ${keeper.id}
      where ingredient_id in ${sql(losers)}
    `;
    await sql`
      update shift_counts
      set ingredient_id = ${keeper.id}
      where ingredient_id in ${sql(losers)}
    `;
    await sql`delete from ingredients where id in ${sql(losers)}`;
    removed += losers.length;
  }

  const duplicateLines = await sql`
    select menu_item_id, ingredient_id,
           sum(gross_quantity) as qty,
           (array_agg(id order by id))[1] as keep_id
    from recipe_boms
    group by menu_item_id, ingredient_id
    having count(*) > 1
  `;
  for (const line of duplicateLines) {
    await sql`
      update recipe_boms
      set gross_quantity = ${line.qty}
      where id = ${line.keep_id}
    `;
    await sql`
      delete from recipe_boms
      where menu_item_id = ${line.menu_item_id}
        and ingredient_id = ${line.ingredient_id}
        and id <> ${line.keep_id}
    `;
  }
  return removed;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const restaurants = await sql`select id from restaurants`;
    let dishes = 0;
    let ingredients = 0;
    for (const restaurant of restaurants) {
      await sql.begin(async (tx) => {
        dishes += await dedupeMenu(tx, restaurant.id);
        ingredients += await dedupeIngredients(tx, restaurant.id);
      });
    }
    console.log(
      `→ deduped ${dishes} duplicate dish(es) and ${ingredients} duplicate ingredient(s)`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
