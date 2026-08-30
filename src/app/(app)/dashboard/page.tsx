"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { money, num } from "@/lib/utils";
import { DataAlert, MiniBarChart, StatTile } from "@/components/ui/data-viz";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  parLevel: string | null;
  costPerUnit: string;
};

export default function DashboardPage() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Unauthorized");
      return res.json() as Promise<{
        restaurant: {
          cuisineType: string;
          city: string;
          region: string;
          currency: string;
        };
      }>;
    },
  });

  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      return res.json() as Promise<{ ingredients: Ingredient[] }>;
    },
  });

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const res = await fetch("/api/menu");
      return res.json() as Promise<{ menuItems: unknown[] }>;
    },
  });

  const stock = ingredients.data?.ingredients ?? [];
  const low = stock.filter(
    (i) => num(i.parLevel) > 0 && num(i.currentStock) < num(i.parLevel),
  );
  const inventoryValue = stock.reduce(
    (sum, i) => sum + num(i.currentStock) * num(i.costPerUnit),
    0,
  );
  const currency = me.data?.restaurant?.currency ?? "USD";
  const menuCount = menu.data?.menuItems?.length ?? 0;

  const chartBars = [
    { label: "Stock", value: Math.max(stock.length, 1) },
    { label: "Menu", value: Math.max(menuCount, 1) },
    { label: "Low", value: Math.max(low.length, 0.4) },
  ];

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Know what your kitchen uses.
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {me.data?.restaurant?.cuisineType} · {me.data?.restaurant?.city}
          {me.data?.restaurant?.region ? `, ${me.data.restaurant.region}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="On-hand value"
          value={money(inventoryValue, currency)}
          tone="cream"
        />
        <StatTile
          label="Menu items"
          value={String(menuCount || "—")}
          tone="forest"
        />
      </div>

      <Card>
        <MiniBarChart title="Usage by station" bars={chartBars} />
      </Card>

      <DataAlert
        title="Below par"
        message={
          low.length === 0
            ? "All tracked items at par."
            : `${low.length} ingredient${low.length === 1 ? "" : "s"} need a plan before next service.`
        }
        count={low.length}
      />

      {low.length > 0 && (
        <Card className="space-y-2">
          <CardTitle>Priority pulls</CardTitle>
          <ul className="space-y-2">
            {low.slice(0, 5).map((i) => (
              <li key={i.id} className="flex justify-between text-sm">
                <span>{i.name}</span>
                <span className="font-medium text-[var(--warn)]">
                  {num(i.currentStock)} {i.unit}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-2">
        <Link
          href="/shifts"
          className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--accent-fg)]"
        >
          Run blind closing count →
        </Link>
        <Link
          href="/menu"
          className="rounded-2xl border border-[var(--fg)] bg-[var(--surface)] px-4 py-3 text-sm font-medium"
        >
          Autofill menu with Gemini →
        </Link>
        <Link
          href="/insights"
          className="rounded-2xl bg-[var(--tan)] px-4 py-3 text-sm font-medium"
        >
          Area cuisine grocery vs sales →
        </Link>
      </div>
    </div>
  );
}
