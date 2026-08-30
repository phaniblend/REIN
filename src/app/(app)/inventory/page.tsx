"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { num } from "@/lib/utils";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentStock: string;
  parLevel: string | null;
};

export default function InventoryPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    category: "Proteins",
    unit: "KG",
    costPerUnit: "0",
    currentStock: "0",
    parLevel: "0",
  });
  const [receipt, setReceipt] = useState({
    ingredientId: "",
    quantity: "",
    unitCost: "",
  });

  const list = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      return res.json() as Promise<{ ingredients: Ingredient[] }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          unit: form.unit,
          costPerUnit: Number(form.costPerUnit),
          currentStock: Number(form.currentStock),
          parLevel: Number(form.parLevel),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setForm((f) => ({ ...f, name: "", currentStock: "0" }));
    },
  });

  const receive = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: receipt.ingredientId,
          quantity: Number(receipt.quantity),
          unitCost: Number(receipt.unitCost),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setReceipt({ ingredientId: "", quantity: "", unitCost: "" });
    },
  });

  const ingredients = list.data?.ingredients ?? [];

  return (
    <div className="animate-rise space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        Stock
      </h1>

      <Card className="space-y-3">
        <CardTitle>Add ingredient</CardTitle>
        <div className="grid gap-2">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label>Unit</Label>
              <select
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {["KG", "G", "L", "ML", "PIECE", "PACKET"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Cost / unit</Label>
              <Input
                type="number"
                value={form.costPerUnit}
                onChange={(e) =>
                  setForm({ ...form, costPerUnit: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Stock</Label>
              <Input
                type="number"
                value={form.currentStock}
                onChange={(e) =>
                  setForm({ ...form, currentStock: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Par</Label>
              <Input
                type="number"
                value={form.parLevel}
                onChange={(e) => setForm({ ...form, parLevel: e.target.value })}
              />
            </div>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!form.name || create.isPending}
          >
            Save ingredient
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Receive purchase</CardTitle>
        <select
          className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
          value={receipt.ingredientId}
          onChange={(e) =>
            setReceipt({ ...receipt, ingredientId: e.target.value })
          }
        >
          <option value="">Select ingredient</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            placeholder="Qty"
            value={receipt.quantity}
            onChange={(e) =>
              setReceipt({ ...receipt, quantity: e.target.value })
            }
          />
          <Input
            type="number"
            placeholder="Unit cost"
            value={receipt.unitCost}
            onChange={(e) =>
              setReceipt({ ...receipt, unitCost: e.target.value })
            }
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => receive.mutate()}
          disabled={!receipt.ingredientId || receive.isPending}
        >
          Log receipt
        </Button>
      </Card>

      <div className="space-y-2">
        {ingredients.map((i) => (
          <Card key={i.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{i.name}</p>
              <p className="text-xs text-[var(--muted)]">{i.category}</p>
            </div>
            <div className="text-right">
              <p className="font-[family-name:var(--font-display)]">
                {num(i.currentStock)} {i.unit}
              </p>
              {num(i.parLevel) > 0 && num(i.currentStock) < num(i.parLevel) && (
                <Badge className="bg-[var(--accent-soft)] text-[var(--accent)]">
                  Below par
                </Badge>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
