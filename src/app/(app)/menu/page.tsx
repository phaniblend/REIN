"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { money, num } from "@/lib/utils";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  sellingPrice: string;
  menuApprovalStatus: string;
  recipe: unknown[];
};

const CATEGORY_ORDER = [
  "Appetizers",
  "Soups & Salads",
  "Main Course — Veg",
  "Main Course — Non-Veg",
  "Main Course",
  "Breads & Rice",
  "Sides",
  "Desserts",
  "Beverages",
];

function categorySortKey(category: string) {
  const idx = CATEGORY_ORDER.findIndex(
    (c) => c.toLowerCase() === category.trim().toLowerCase(),
  );
  return idx === -1 ? 100 + category.charCodeAt(0) : idx;
}

export default function MenuPage() {
  const qc = useQueryClient();
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const res = await fetch("/api/menu");
      return res.json() as Promise<{ menuItems: MenuItem[] }>;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/menu/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focus: focus || undefined,
          count: 40,
          persist: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      return data as { persisted: unknown[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setMessage(
        `Added ${data.persisted?.length ?? 0} menu items with recipe BOMs.`,
      );
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const items = menu.data?.menuItems ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      const key = item.category?.trim() || "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => categorySortKey(a) - categorySortKey(b),
    );
  }, [items]);

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Menu & recipes
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Generate a full categorized lunch & dinner menu (~40 dishes) with
          portion recipes for yield tracking.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Recommended menu</CardTitle>
        <Input
          placeholder="Optional focus (e.g. North Indian, Punjabi, seafood-heavy)"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        />
        <Button
          onClick={() => {
            setMessage(null);
            generate.mutate();
          }}
          disabled={generate.isPending}
        >
          {generate.isPending
            ? "Generating full menu… (1–2 min)"
            : "Generate recommended menu"}
        </Button>
        {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
      </Card>

      <div className="space-y-6">
        {grouped.map(([category, categoryItems]) => (
          <section key={category} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--accent)]">
                {category}
              </h2>
              <span className="text-xs text-[var(--muted)]">
                {categoryItems.length} items
              </span>
            </div>
            {categoryItems.map((item) => (
              <Card key={item.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{item.name}</p>
                  <p className="font-[family-name:var(--font-display)]">
                    {money(num(item.sellingPrice))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge>{item.menuApprovalStatus}</Badge>
                  <Badge>{item.recipe?.length ?? 0} ingredients</Badge>
                </div>
              </Card>
            ))}
          </section>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No menu yet — generate a recommended menu to get started.
          </p>
        )}
      </div>
    </div>
  );
}
