import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  ingredients,
  integrationConnections,
  locations,
  posSaleLines,
  restaurants,
  shiftCounts,
  users,
  wastageLogs,
} from "@/db/schema";
import { dishFoodCosts } from "@/lib/food-cost";
import { sendSms } from "@/lib/sms";
import { num } from "@/lib/utils";

function alertLabel(type: string, payload: string | null) {
  let name = "";
  try {
    const parsed = payload ? (JSON.parse(payload) as { name?: string }) : null;
    name = parsed?.name ? ` on ${parsed.name}` : "";
  } catch {
    name = "";
  }
  if (type === "price_change") return `price change${name}`;
  if (type === "variance") return `count variance${name}`;
  return type.replaceAll("_", " ") + name;
}

/** Midnight at the start of "today" in the location timezone (UTC instant). */
export function startOfDayInTimezone(timeZone: string, now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asUtc - now.getTime();
  const midnightAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    0,
    0,
    0,
  );
  return new Date(midnightAsUtc - offsetMs);
}

export async function buildDigest(restaurantId: string) {
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  const [site] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.restaurantId, restaurantId))
    .limit(1);
  const since = startOfDayInTimezone(site?.timezone || "America/Chicago");
  const sales = await db
    .select({ netCents: posSaleLines.netCents, channel: posSaleLines.channel })
    .from(posSaleLines)
    .innerJoin(
      integrationConnections,
      eq(posSaleLines.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.restaurantId, restaurantId),
        gte(posSaleLines.soldAt, since),
      ),
    );
  const salesCents = sales.reduce((sum, row) => sum + num(row.netCents), 0);
  const deliveryCents = sales
    .filter((row) => row.channel === "delivery")
    .reduce((sum, row) => sum + num(row.netCents), 0);
  const costs = await dishFoodCosts(restaurantId);
  const percents = costs
    .map((row) => row.foodCostPercent)
    .filter((value): value is number => value !== null);
  const food =
    percents.length > 0
      ? percents.reduce((sum, value) => sum + value, 0) / percents.length
      : null;
  const waste = await db
    .select()
    .from(wastageLogs)
    .where(
      and(eq(wastageLogs.restaurantId, restaurantId), gte(wastageLogs.createdAt, since)),
    );
  const openAlerts = await db
    .select()
    .from(alerts)
    .where(eq(alerts.restaurantId, restaurantId))
    .orderBy(desc(alerts.createdAt))
    .limit(5);
  const variances = await db
    .select({
      variance: shiftCounts.variance,
      name: ingredients.name,
      unit: ingredients.unit,
    })
    .from(shiftCounts)
    .innerJoin(ingredients, eq(ingredients.id, shiftCounts.ingredientId))
    .where(eq(shiftCounts.restaurantId, restaurantId))
    .orderBy(desc(shiftCounts.createdAt))
    .limit(3);
  const foodLine =
    salesCents <= 0
      ? "Food cost: no sales yet today"
      : food === null
        ? "Food cost: no priced recipes yet"
        : `Food cost ${food.toFixed(0)}%`;
  const lines = [
    `${restaurant?.name ?? "Restman"} daily digest`,
    `Sales $${(salesCents / 100).toFixed(2)} (delivery $${(deliveryCents / 100).toFixed(2)})`,
    foodLine,
    `Waste logs today: ${waste.length}`,
    openAlerts.length
      ? `Alerts: ${openAlerts.map((row) => alertLabel(row.type, row.payload)).join("; ")}`
      : "No open alerts",
    variances.length
      ? `Latest count variances: ${variances
          .map(
            (row) =>
              `${row.name} ${num(row.variance).toFixed(2)} ${row.unit}`,
          )
          .join("; ")}`
      : "No count yet today",
  ];
  return lines.join("\n");
}

export function hourInTimezone(timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date());
  return Number(hour);
}

export async function deliverDigest(restaurantId: string) {
  const body = await buildDigest(restaurantId);
  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.restaurantId, restaurantId))
    .limit(1);
  const people = await db
    .select()
    .from(users)
    .where(eq(users.restaurantId, restaurantId));
  const recipients = people.filter(
    (person) =>
      person.phone &&
      (person.role === "OWNER" || (person.role === "CHEF" && person.digestOptIn)),
  );
  let channel = "in-app";
  for (const person of recipients) {
    const result = await sendSms(person.phone!, body);
    channel = result.provider;
  }
  const { digestRuns } = await import("@/db/schema");
  await db.insert(digestRuns).values({
    restaurantId,
    locationId: location?.id,
    body,
    channel,
  });
  return { body, channel, recipients: recipients.length };
}
