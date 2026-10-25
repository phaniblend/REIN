"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Location = { id: string; name: string; timezone: string; closeHour: string };
type Bin = {
  locationId: string;
  ingredientId: string;
  qty: string;
  name: string;
  unit: string;
};

export default function PlacesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load locations");
      return body as { locations: Location[]; stock: Bin[]; activeLocationId: string };
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add the location");
      return body;
    },
    onSuccess: async () => {
      setName("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const activate = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await fetch("/api/locations/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not switch");
      return body;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const transfer = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLocationId,
          toLocationId,
          ingredientId,
          qty: Number(qty),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not move stock");
      return body;
    },
    onSuccess: async () => {
      setQty("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const locations = data.data?.locations ?? [];
  const stock = data.data?.stock ?? [];
  const names = new Map<string, string>();
  for (const bin of stock) names.set(bin.ingredientId, `${bin.name} (${bin.unit})`);

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Locations
        </h1>
        <p className="text-sm text-[var(--muted)]">
          The site you select is the one Stock, Count, and new invoices use.
        </p>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <Card className="space-y-2">
        <CardTitle>Sites</CardTitle>
        <ul className="space-y-2 text-sm">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-2">
              <span>
                {location.name}
                {location.id === data.data?.activeLocationId ? " · active" : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={() => activate.mutate(location.id)}>
                Use
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New location" />
          <Button disabled={add.isPending || !name.trim()} onClick={() => add.mutate()}>
            Add
          </Button>
        </div>
      </Card>
      <Card className="space-y-2">
        <CardTitle>On hand by site</CardTitle>
        <ul className="space-y-1 text-sm">
          {stock.map((bin) => (
            <li key={`${bin.locationId}-${bin.ingredientId}`}>
              {locations.find((location) => location.id === bin.locationId)?.name} · {bin.name}{" "}
              {bin.qty} {bin.unit}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-3">
        <CardTitle>Transfer</CardTitle>
        <div className="space-y-1">
          <Label>From</Label>
          <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm" value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
            <option value="">Source</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
            <option value="">Destination</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Item</Label>
          <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
            <option value="">Stock item</option>
            {[...names.entries()].map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
        <Input value={qty} onChange={(event) => setQty(event.target.value)} placeholder="Quantity" />
        <Button
          disabled={transfer.isPending || !fromLocationId || !toLocationId || !ingredientId || !qty}
          onClick={() => transfer.mutate()}
        >
          Move stock
        </Button>
      </Card>
    </div>
  );
}
