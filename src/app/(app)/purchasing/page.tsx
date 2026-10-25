"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Line = {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  supplierName: string | null;
};

type Order = {
  id: string;
  supplierName: string;
  status: string;
  createdAt: string;
};

export default function PurchasingPage() {
  const qc = useQueryClient();
  const [supplierName, setSupplierName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unauthorized");
      return data as { user: { role: string } };
    },
  });
  const isOwner = me.data?.user?.role === "OWNER";

  const data = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const res = await fetch("/api/purchase-orders");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load orders");
      return body as { suggestions: Line[]; orders: Order[] };
    },
  });

  const draft = useMutation({
    mutationFn: async () => {
      const lines = (data.data?.suggestions ?? []).filter((line) => picked[line.ingredientId]);
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName || lines[0]?.supplierName || "Supplier",
          phone,
          email: email || undefined,
          lines: lines.map((line) => ({ ingredientId: line.ingredientId, qty: line.qty })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the draft");
      return body;
    },
    onSuccess: async () => {
      setError(null);
      setPicked({});
      await qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const send = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/purchase-orders/${id}/send`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send");
      return body as { message: string; channel: string };
    },
    onSuccess: async (body) => {
      setSent(body.message);
      await qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const suggestions = data.data?.suggestions ?? [];

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Purchase orders
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Suggested from par, what is on hand, and recent usage. The owner sends it.
        </p>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {sent && (
        <Card>
          <CardTitle>Sent message</CardTitle>
          <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{sent}</p>
        </Card>
      )}
      <Card className="space-y-3">
        <CardTitle>Suggested</CardTitle>
        {suggestions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nothing is below par. Set a par on stock items to see suggestions.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {suggestions.map((line) => (
              <li key={line.ingredientId} className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(picked[line.ingredientId])}
                    onChange={(event) =>
                      setPicked((current) => ({
                        ...current,
                        [line.ingredientId]: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    {line.name} · {line.qty} {line.unit}
                  </span>
                </label>
                {line.supplierName && <Badge>{line.supplierName}</Badge>}
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-1">
          <Label htmlFor="supplier">Supplier</Label>
          <Input
            id="supplier"
            value={supplierName}
            onChange={(event) => setSupplierName(event.target.value)}
            placeholder="Supplier name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Supplier phone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Optional, for SMS"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Supplier email</Label>
          <Input
            id="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Optional"
          />
        </div>
        <Button
          disabled={draft.isPending || !Object.values(picked).some(Boolean)}
          onClick={() => draft.mutate()}
        >
          Save draft
        </Button>
      </Card>
      {(data.data?.orders ?? []).map((order) => (
        <Card key={order.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle>{order.supplierName}</CardTitle>
            <Badge>{order.status}</Badge>
          </div>
          {order.status === "draft" && isOwner && (
            <Button size="sm" disabled={send.isPending} onClick={() => send.mutate(order.id)}>
              Send
            </Button>
          )}
          {order.status === "draft" && me.data && !isOwner && (
            <p className="text-xs text-[var(--muted)]">Waiting for the owner to send.</p>
          )}
        </Card>
      ))}
    </div>
  );
}
