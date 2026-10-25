"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { homePathForRole } from "@/lib/roles";
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
  const router = useRouter();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Unauthorized");
      return res.json() as Promise<{
        user: { role: string };
        restaurant: {
          cuisineType: string;
          city: string;
          region: string;
          currency: string;
        };
      }>;
    },
  });

  useEffect(() => {
    const role = me.data?.user?.role;
    if (!role || role === "OWNER") return;
    const home = homePathForRole(role);
    if (home !== "/dashboard") router.replace(home);
  }, [me.data?.user?.role, router]);

  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      return res.json() as Promise<{ ingredients: Ingredient[] }>;
    },
  });

  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await fetch("/api/integrations");
      if (!res.ok) return { connections: [], catalog: [] };
      return res.json() as Promise<{
        connections: { status: string; lastSyncedAt: string | null }[];
        catalog: { dishId: string | null }[];
      }>;
    },
  });

  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts");
      if (!res.ok) return { alerts: [] as { id: string; type: string; payload: string }[] };
      return res.json() as Promise<{ alerts: { id: string; type: string; payload: string }[] }>;
    },
  });

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const res = await fetch("/api/menu");
      return res.json() as Promise<{ menuItems: unknown[] }>;
    },
  });

  const role = me.data?.user?.role;
  if (
    me.isLoading ||
    (role && role !== "OWNER" && homePathForRole(role) !== "/dashboard")
  ) {
    return (
      <p className="text-sm text-[var(--muted)]">Opening your workspace…</p>
    );
  }

  const stock = ingredients.data?.ingredients ?? [];
  const low = stock.filter((i) => {
    const par = num(i.parLevel);
    const onHand = num(i.currentStock);
    if (onHand <= 0) return true;
    return par > 0 && onHand < par;
  });
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

      <Card className="space-y-1">
        <CardTitle>Register</CardTitle>
        <p className="text-sm text-[var(--muted)]">
          {(() => {
            const live = (integrations.data?.connections ?? []).find(
              (row) => row.status === "connected",
            );
            const unmapped = (integrations.data?.catalog ?? []).filter(
              (row) => !row.dishId,
            ).length;
            if (!live) return "No register connected yet.";
            const when = live.lastSyncedAt
              ? new Date(live.lastSyncedAt).toLocaleString()
              : "not yet";
            return `Last synced ${when}. ${unmapped} item${unmapped === 1 ? "" : "s"} still need a recipe.`;
          })()}
        </p>
      </Card>

      <Card className="space-y-2">
        <CardTitle>Today</CardTitle>
        <p className="text-sm text-[var(--muted)]">
          {(alerts.data?.alerts ?? []).length === 0
            ? "No price or sync alerts."
            : (alerts.data?.alerts ?? [])
                .map((alert) => alert.type.replaceAll("_", " "))
                .join(", ")}
        </p>
        <button
          type="button"
          className="text-sm font-medium text-[var(--accent)]"
          onClick={async () => {
            const res = await fetch("/api/accounting/cogs", { method: "POST" });
            const data = await res.json();
            if (!res.ok) return;
            window.alert(
              data.amountCents
                ? `Food cost entry saved for $${(data.amountCents / 100).toFixed(2)}.`
                : "No sales yet today, so the food-cost entry is zero.",
            );
          }}
        >
          Post today&apos;s food cost to the books
        </button>
        <button
          type="button"
          className="text-sm font-medium text-[var(--accent)]"
          onClick={async () => {
            await fetch("/api/digest", { method: "POST" });
            await alerts.refetch();
          }}
        >
          Send today&apos;s digest
        </button>
      </Card>

      <DataAlert
        title="Below par"
        message={
          low.length === 0
            ? "All tracked items at par."
            : low.length === 1
              ? "1 ingredient needs a plan before next service."
              : `${low.length} ingredients need a plan before next service.`
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
          prefetch={false}
          className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--accent-fg)]"
        >
          Run blind closing count →
        </Link>
        <Link
          href="/menu"
          prefetch={false}
          className="rounded-2xl border border-[var(--fg)] bg-[var(--surface)] px-4 py-3 text-sm font-medium"
        >
          Generate recommended menu →
        </Link>
        <Link
          href="/insights"
          prefetch={false}
          className="rounded-2xl bg-[var(--tan)] px-4 py-3 text-sm font-medium"
        >
          Area cuisine grocery vs sales →
        </Link>
      </div>
    </div>
  );
}
