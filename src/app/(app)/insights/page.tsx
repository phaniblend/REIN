"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/data-viz";

type LocationStats = {
  cuisineType: string;
  locationLabel: string;
  sampleConfidence: "low" | "medium" | "high";
  disclaimer: string;
  averages: {
    foodCostPercentOfSales: number;
    grocerySpendVsTheoreticalUsagePercent: number;
    groceryBoughtVsSoldRatio: number;
    typicalGrossMarginPercent: number;
    spoilageWastePercentOfPurchases: number;
    unaccountedShrinkPercentOfUsage: number;
    weeklyGrocerySpendUsd?: number;
    weeklyFoodSalesUsd?: number;
  };
  notes: string[];
  benchmarks: {
    metric: string;
    value: number;
    unit: string;
    interpretation: string;
  }[];
};

export default function InsightsPage() {
  const [stats, setStats] = useState<LocationStats | null>(null);

  const load = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/insights/location", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load insights");
      return data.stats as LocationStats;
    },
    onSuccess: setStats,
  });

  const a = stats?.averages;

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Area cuisine averages
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Typical same-cuisine averages for your city — not competitor-specific
          POS data.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Grocery bought vs sold</CardTitle>
        <p className="text-sm text-[var(--muted)]">
          Uses your restaurant cuisine + city from registration.
        </p>
        <Button onClick={() => load.mutate()} disabled={load.isPending}>
          {load.isPending ? "Loading…" : "Refresh area benchmarks"}
        </Button>
        {load.error && (
          <p className="text-sm text-[var(--danger)]">
            {(load.error as Error).message}
          </p>
        )}
      </Card>

      {stats && a && (
        <>
          <Card className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                {stats.cuisineType} · {stats.locationLabel}
              </CardTitle>
              <Badge>confidence {stats.sampleConfidence}</Badge>
            </div>
            <p className="text-xs text-[var(--muted)]">{stats.disclaimer}</p>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Bought / sold ratio"
              value={`${a.groceryBoughtVsSoldRatio.toFixed(2)}×`}
              tone="cream"
            />
            <StatTile
              label="Food cost %"
              value={`${a.foodCostPercentOfSales.toFixed(1)}%`}
              tone="forest"
            />
            <StatTile
              label="Spoilage %"
              value={`${a.spoilageWastePercentOfPurchases.toFixed(1)}%`}
              tone="cream"
            />
            <StatTile
              label="Unaccounted shrink"
              value={`${a.unaccountedShrinkPercentOfUsage.toFixed(1)}%`}
              tone="forest"
            />
          </div>

          <Card className="space-y-2">
            <CardTitle>Benchmarks</CardTitle>
            <ul className="space-y-2">
              {stats.benchmarks.map((b) => (
                <li key={b.metric} className="text-sm">
                  <p className="font-medium">
                    {b.metric}: {b.value}
                    {b.unit}
                  </p>
                  <p className="text-[var(--muted)]">{b.interpretation}</p>
                </li>
              ))}
            </ul>
          </Card>

          {stats.notes?.length > 0 && (
            <Card className="space-y-2">
              <CardTitle>Notes</CardTitle>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                {stats.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
