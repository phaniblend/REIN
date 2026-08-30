"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataAlert } from "@/components/ui/data-viz";

type Ingredient = { id: string; name: string; unit: string };
type WasteRow = {
  id: string;
  ingredientName: string;
  quantity: string;
  kind: string;
  reason: string;
  createdAt: string;
};

export default function WastagePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    ingredientId: "",
    quantity: "",
    kind: "KITCHEN_SPOILED" as string,
    reason: "",
  });

  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      return res.json() as Promise<{ ingredients: Ingredient[] }>;
    },
  });

  const logs = useQuery({
    queryKey: ["wastage"],
    queryFn: async () => {
      const res = await fetch("/api/wastage");
      return res.json() as Promise<{ wastage: WasteRow[] }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: form.ingredientId,
          quantity: Number(form.quantity),
          kind: form.kind,
          reason: form.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, quantity: "", reason: "" }));
      qc.invalidateQueries({ queryKey: ["wastage"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Wastage log
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Categorize spoil / return waste so it is excluded from unaccounted
          loss.
        </p>
      </div>

      <DataAlert
        title="Waste entries"
        message={
          (logs.data?.wastage?.length ?? 0) === 0
            ? "No waste logged yet this period."
            : `${logs.data?.wastage.length} logged entries — keep spoilage out of AvT.`
        }
        count={logs.data?.wastage?.length ?? 0}
      />

      <Card className="space-y-3">
        <CardTitle>Log waste</CardTitle>
        <div>
          <Label>Ingredient</Label>
          <select
            className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={form.ingredientId}
            onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}
          >
            <option value="">Select…</option>
            {(ingredients.data?.ingredients ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Kind</Label>
          <select
            className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="KITCHEN_SPOILED">Kitchen spoiled</option>
            <option value="POS_RETURNED_WASTE">POS returned — wasted</option>
            <option value="POS_RETURNED_REUSED">POS returned — reused</option>
          </select>
        </div>
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>
        <div>
          <Label>Reason</Label>
          <Input
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Burnt batch, dropped tray…"
          />
        </div>
        <Button
          disabled={
            !form.ingredientId ||
            !form.quantity ||
            !form.reason ||
            create.isPending
          }
          onClick={() => create.mutate()}
        >
          Save wastage
        </Button>
      </Card>

      <div className="space-y-2">
        {(logs.data?.wastage ?? []).map((row) => (
          <Card key={row.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{row.ingredientName}</p>
              <Badge>{row.kind}</Badge>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {row.quantity} · {row.reason}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
