"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardTitle } from "@/components/ui/card";

type PrepLine = { ingredientId: string; name: string; unit: string; qty: number };
type Dish = { name: string; qty: number };

export default function PrepPage() {
  const prep = useQuery({
    queryKey: ["prep"],
    queryFn: async () => {
      const res = await fetch("/api/prep");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build the prep list");
      return data as { lines: PrepLine[]; dishes: Dish[] };
    },
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Today&apos;s prep
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Average of this weekday over the last four weeks, times each recipe.
        </p>
      </div>
      {prep.error && (
        <p className="text-sm text-[var(--danger)]">{(prep.error as Error).message}</p>
      )}
      <Card className="space-y-2">
        <CardTitle>Dishes</CardTitle>
        {(prep.data?.dishes ?? []).length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No sales for this weekday yet. Connect a register or ring tickets, then come back.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {prep.data?.dishes.map((dish) => (
              <li key={dish.name}>
                {dish.name} · {dish.qty.toFixed(1)}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="space-y-2">
        <CardTitle>To prep</CardTitle>
        <ul className="space-y-1 text-sm">
          {(prep.data?.lines ?? []).map((line) => (
            <li key={line.ingredientId}>
              {line.name} · {line.qty.toFixed(2)} {line.unit}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
