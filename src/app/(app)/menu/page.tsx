"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
          count: 6,
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

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Menu & recipes
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Generate a recommended menu with portion recipes for yield tracking.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Recommended menu</CardTitle>
        <Input
          placeholder="Optional focus (e.g. weekend brunch, high-protein)"
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
          {generate.isPending ? "Generating…" : "Generate recommended menu"}
        </Button>
        {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
      </Card>

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-[var(--muted)]">{item.category}</p>
              </div>
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
        {items.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No menu yet — generate a recommended menu to get started.
          </p>
        )}
      </div>
    </div>
  );
}
