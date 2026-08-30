"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/utils";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
};

type AvtRow = {
  ingredientId: string;
  name: string;
  unit: string;
  actualUsage: number;
  theoreticalUsage: number;
  unaccountedLoss: number;
  unaccountedCost: number;
  variancePercentOfTheoretical: number | null;
  exceedsThreshold: boolean;
};

export default function ShiftsPage() {
  const qc = useQueryClient();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    results: AvtRow[];
    alerts: AvtRow[];
    thresholdPercent: number;
  } | null>(null);

  const list = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      return res.json() as Promise<{ ingredients: Ingredient[] }>;
    },
  });

  const ingredients = list.data?.ingredients ?? [];

  const payload = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, raw] of Object.entries(counts)) {
      if (raw === "") continue;
      out[id] = Number(raw);
    }
    return out;
  }, [counts]);

  const reconcile = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shifts/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counts: payload,
          commitStock: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reconcile failed");
      return data as {
        results: AvtRow[];
        alerts: AvtRow[];
        thresholdPercent: number;
      };
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Blind shift count
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Enter physical counts without seeing theoretical balances. AvT runs on
          submit.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Primary ingredients</CardTitle>
        <div className="space-y-2">
          {ingredients.map((ing) => (
            <div
              key={ing.id}
              className="grid grid-cols-[1fr_7rem] items-center gap-2"
            >
              <div>
                <p className="text-sm font-medium">{ing.name}</p>
                <p className="text-xs text-[var(--muted)]">{ing.unit}</p>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Count"
                value={counts[ing.id] ?? ""}
                onChange={(e) =>
                  setCounts((c) => ({ ...c, [ing.id]: e.target.value }))
                }
              />
            </div>
          ))}
          {ingredients.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Add ingredients in Stock first.
            </p>
          )}
        </div>
        <Button
          disabled={Object.keys(payload).length === 0 || reconcile.isPending}
          onClick={() => reconcile.mutate()}
        >
          {reconcile.isPending ? "Reconciling…" : "Close & reconcile"}
        </Button>
        {reconcile.error && (
          <p className="text-sm text-[var(--danger)]">
            {(reconcile.error as Error).message}
          </p>
        )}
      </Card>

      {result && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>AvT results</CardTitle>
            <Badge>Threshold {result.thresholdPercent}%</Badge>
          </div>
          {result.alerts.length > 0 && (
            <p className="text-sm text-[var(--danger)]">
              {result.alerts.length} ingredient(s) exceed unaccounted-loss
              threshold.
            </p>
          )}
          <ul className="space-y-2">
            {result.results.map((row) => (
              <li
                key={row.ingredientId}
                className="rounded-lg border border-[var(--border)] p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{row.name}</p>
                  {row.exceedsThreshold && (
                    <Badge className="bg-[var(--danger)] text-white">Alert</Badge>
                  )}
                </div>
                <p className="mt-1 text-[var(--muted)]">
                  Actual {row.actualUsage.toFixed(3)} · Theoretical{" "}
                  {row.theoreticalUsage.toFixed(3)} · Unaccounted{" "}
                  {row.unaccountedLoss.toFixed(3)} {row.unit}
                </p>
                <p className="text-[var(--muted)]">
                  Unaccounted cost {money(row.unaccountedCost)}
                  {row.variancePercentOfTheoretical !== null
                    ? ` · ${row.variancePercentOfTheoretical.toFixed(1)}% of theoretical`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
