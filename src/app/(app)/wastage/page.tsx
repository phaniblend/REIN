"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataAlert } from "@/components/ui/data-viz";
import { money, num } from "@/lib/utils";
import {
  WASTAGE_KINDS,
  wasteDeductsStock,
  wasteKindLabel,
} from "@/lib/wastage";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  costPerUnit: string;
  currentStock: string;
};

type WasteRow = {
  id: string;
  ingredientName: string;
  unit: string;
  quantity: string;
  unitCost: string;
  shortfall: string;
  loss: string;
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
  const [qtyError, setQtyError] = useState<string | null>(null);

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
      return res.json() as Promise<{ wastage: WasteRow[]; weekLoss: string }>;
    },
  });

  const selected = useMemo(
    () =>
      (ingredients.data?.ingredients ?? []).find(
        (i) => i.id === form.ingredientId,
      ) ?? null,
    [ingredients.data?.ingredients, form.ingredientId],
  );

  const qty = num(form.quantity, Number.NaN);
  const onHand = selected ? num(selected.currentStock) : 0;
  const overStock =
    selected &&
    wasteDeductsStock(form.kind) &&
    Number.isFinite(qty) &&
    qty > onHand;

  function validateQuantity(raw: string) {
    if (!raw.trim()) {
      setQtyError(null);
      return false;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      setQtyError("Enter a quantity above 0");
      return false;
    }
    setQtyError(null);
    return true;
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!validateQuantity(form.quantity)) {
        throw new Error("Enter a quantity above 0");
      }
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
      return data as { warned?: boolean; shortfall?: number };
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, quantity: "", reason: "" }));
      setQtyError(null);
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
        title="Waste this week"
        message={
          (logs.data?.wastage?.length ?? 0) === 0
            ? "No waste logged yet this period."
            : `${logs.data?.wastage.length} recent entries · ${money(logs.data?.weekLoss ?? 0)} lost in the last 7 days.`
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
                {i.name} ({i.unit}) · {num(i.currentStock).toFixed(3)} on hand
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
            {WASTAGE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {wasteKindLabel(kind)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>
            Quantity
            {selected ? (
              <span className="ml-1 font-normal text-[var(--muted)]">
                ({selected.unit})
              </span>
            ) : null}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0.001"
              step="any"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => {
                setForm({ ...form, quantity: e.target.value });
                validateQuantity(e.target.value);
              }}
            />
            {selected ? (
              <span className="shrink-0 text-sm text-[var(--muted)]">
                {selected.unit}
              </span>
            ) : null}
          </div>
          {qtyError && (
            <p className="mt-1 text-sm text-[var(--danger)]">{qtyError}</p>
          )}
          {overStock && !qtyError && (
            <p className="mt-1 text-sm text-[var(--danger)]">
              Only {onHand.toFixed(3)} {selected?.unit} on hand. The extra{" "}
              {(qty - onHand).toFixed(3)} {selected?.unit} will be saved as a
              shortfall for the next count.
            </p>
          )}
          {selected && Number.isFinite(qty) && qty > 0 && !qtyError && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              About {money(qty * num(selected.costPerUnit))} at{" "}
              {money(selected.costPerUnit)}/{selected.unit}
            </p>
          )}
        </div>
        <div>
          <Label>Reason</Label>
          <Input
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Burnt batch, dropped tray…"
          />
        </div>
        {create.isError && (
          <p className="text-sm text-[var(--danger)]">
            {(create.error as Error).message}
          </p>
        )}
        <Button
          disabled={
            !form.ingredientId ||
            !form.quantity ||
            !form.reason ||
            Boolean(qtyError) ||
            !(Number(form.quantity) > 0) ||
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
              <Badge>{wasteKindLabel(row.kind)}</Badge>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {num(row.quantity).toFixed(3)} {row.unit} · {row.reason}
            </p>
            <p className="text-sm">
              {row.kind === "POS_RETURNED_REUSED"
                ? "No stock loss"
                : `Loss ${money(row.loss)}`}
              {num(row.shortfall) > 0
                ? ` · shortfall ${num(row.shortfall).toFixed(3)} ${row.unit}`
                : ""}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
