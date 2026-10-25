"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { num } from "@/lib/utils";

type Invoice = {
  id: string;
  supplierName: string;
  status: string;
  totalCents: string;
  createdAt: string;
};

type Line = {
  id: string;
  invoiceId: string;
  rawText: string;
  ingredientId: string | null;
  qty: string;
  unitPriceCents: string;
  confidence: string;
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [supplierName, setSupplierName] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [mime, setMime] = useState("image/jpeg");
  const [error, setError] = useState<string | null>(null);

  const stock = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      const data = await res.json();
      if (!res.ok) return { ingredients: [] as { id: string; name: string }[] };
      return data as { ingredients: { id: string; name: string }[]; locationName?: string };
    },
  });

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unauthorized");
      return data as { user: { role: string } };
    },
  });
  const canConfirm = me.data?.user?.role === "OWNER";

  const list = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load invoices");
      return data as { invoices: Invoice[]; lines: Line[] };
    },
  });

  const scan = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName,
          text,
          imageBase64: photo ?? undefined,
          mime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read that invoice");
      return data;
    },
    onSuccess: async () => {
      setError(null);
      setText("");
      setPhoto(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const matchLine = useMutation({
    mutationFn: async (input: { invoiceId: string; lineId: string; ingredientId: string }) => {
      const res = await fetch(`/api/invoices/${input.invoiceId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: input.lineId, ingredientId: input.ingredientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not match that line");
      return data;
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/invoices/${id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not confirm");
      return data;
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["ingredients"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Invoices
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Paste a delivery. Nothing hits stock until someone confirms it.
        </p>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <Card className="space-y-3">
        <CardTitle>Read a delivery</CardTitle>
        <div className="space-y-1">
          <Label htmlFor="supplier">Supplier</Label>
          <Input
            id="supplier"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="e.g. City produce"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invoice-text">Lines</Label>
          <textarea
            id="invoice-text"
            className="min-h-28 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Onion 8 KG 1.50\nRice 10 KG 2.20"}
          />
        </div>
        <Button
          disabled={scan.isPending || !supplierName.trim() || (!text.trim() && !photo)}
          onClick={() => scan.mutate()}
        >
          Read invoice
        </Button>
        <div className="space-y-1">
          <Label htmlFor="invoice-photo">Or a photo</Label>
          <input
            id="invoice-photo"
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = String(reader.result ?? "");
                const splitAt = result.indexOf(",");
                setMime(file.type || "image/jpeg");
                setPhoto(splitAt >= 0 ? result.slice(splitAt + 1) : result);
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>
        <p className="text-xs text-[var(--muted)]">
          One item per line: name, quantity, unit, price. Low-confidence lines
          stay highlighted and do not post.
        </p>
      </Card>

      {(list.data?.invoices ?? []).map((invoice) => {
        const lines = (list.data?.lines ?? []).filter(
          (line) => line.invoiceId === invoice.id,
        );
        return (
          <Card key={invoice.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>{invoice.supplierName}</CardTitle>
                <p className="text-xs text-[var(--muted)]">
                  ${(num(invoice.totalCents) / 100).toFixed(2)} ·{" "}
                  {new Date(invoice.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge>{invoice.status === "confirmed" ? "Confirmed" : "Draft"}</Badge>
            </div>
            <ul className="space-y-1 text-sm">
              {lines.map((line) => {
                const low = num(line.confidence) < 0.7;
                return (
                  <li
                    key={line.id}
                    className={low ? "text-[var(--danger)]" : undefined}
                  >
                    {line.rawText}
                    {line.ingredientId ? "" : " · no stock match"}
                    {invoice.status === "draft" && (
                      <select
                        className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                        value={line.ingredientId ?? ""}
                        onChange={(event) => {
                          if (!event.target.value) return;
                          matchLine.mutate({
                            invoiceId: invoice.id,
                            lineId: line.id,
                            ingredientId: event.target.value,
                          });
                        }}
                      >
                        <option value="">Match a stock item</option>
                        {(stock.data?.ingredients ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
            {invoice.status === "draft" && canConfirm && (
              <Button
                size="sm"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate(invoice.id)}
              >
                Confirm and post stock
              </Button>
            )}
            {invoice.status === "confirmed" && me.data?.user?.role === "OWNER" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const res = await fetch("/api/accounting/export", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ invoiceId: invoice.id }),
                  });
                  const data = await res.json();
                  if (!res.ok) setError(data.error ?? "Export failed");
                  else setError(null);
                }}
              >
                Export to QuickBooks
              </Button>
            )}
            {invoice.status === "draft" && me.data && !canConfirm && (
              <p className="text-xs text-[var(--muted)]">
                The owner or stock clerk confirms this before stock changes.
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
