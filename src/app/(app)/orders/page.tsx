"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type MenuItem = {
  id: string;
  name: string;
  isActive: boolean;
  menuApprovalStatus?: string;
  recipeApprovalStatus?: string;
};
type Order = {
  id: string;
  tableNumber: string;
  status: string;
  items: { menuItemName: string; quantity: string }[];
};

export default function OrdersPage() {
  const qc = useQueryClient();
  const [tableNumber, setTableNumber] = useState("12");
  const [selected, setSelected] = useState<Record<string, number>>({});

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unauthorized");
      return data as { user: { role: string } };
    },
  });

  const role = me.data?.user?.role;
  const isChef = role === "CHEF";

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const res = await fetch("/api/menu");
      return res.json() as Promise<{ menuItems: MenuItem[] }>;
    },
  });

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders");
      return res.json() as Promise<{ orders: Order[] }>;
    },
  });

  const pendingRecipes = useMemo(
    () =>
      (menu.data?.menuItems ?? []).filter(
        (i) =>
          i.isActive !== false &&
          i.recipeApprovalStatus !== "APPROVED" &&
          i.recipeApprovalStatus !== "REJECTED",
      ).length,
    [menu.data?.menuItems],
  );

  const items = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, qty]) => qty > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    [selected],
  );

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setSelected({});
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "PREPARING" | "SERVED" | "CANCELLED";
    }) => {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          {isChef ? "Kitchen queue" : "POS tickets"}
        </h1>
        {isChef && (
          <p className="text-sm text-[var(--muted)]">
            Tickets from waiters — mark prep and served. Recipes are set once on
            the Recipes tab.
          </p>
        )}
      </div>

      {isChef && pendingRecipes > 0 && (
        <Card className="space-y-2">
          <CardTitle>Finish recipe setup first</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            {pendingRecipes} dish{pendingRecipes === 1 ? "" : "es"} still need
            grocery recipes finalized.
          </p>
          <Link
            href="/recipes"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)]"
          >
            Open recipe setup
          </Link>
        </Card>
      )}

      {!isChef && (
        <Card className="space-y-3">
          <CardTitle>New order</CardTitle>
          <Input
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="Table #"
          />
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {(menu.data?.menuItems ?? [])
              .filter(
                (item) =>
                  item.isActive !== false &&
                  item.menuApprovalStatus === "APPROVED",
              )
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{item.name}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setSelected((s) => ({
                          ...s,
                          [item.id]: Math.max(0, (s[item.id] ?? 0) - 1),
                        }))
                      }
                    >
                      −
                    </Button>
                    <span className="w-6 text-center">
                      {selected[item.id] ?? 0}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setSelected((s) => ({
                          ...s,
                          [item.id]: (s[item.id] ?? 0) + 1,
                        }))
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}
          </div>
          <Button
            disabled={items.length === 0 || create.isPending}
            onClick={() => create.mutate()}
          >
            Send to kitchen
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {(orders.data?.orders ?? []).map((order) => (
          <Card key={order.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">Table {order.tableNumber}</p>
              <Badge>{order.status}</Badge>
            </div>
            <ul className="text-sm text-[var(--muted)]">
              {order.items.map((it, idx) => (
                <li key={idx}>
                  {it.quantity}× {it.menuItemName}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  updateStatus.mutate({ id: order.id, status: "PREPARING" })
                }
              >
                Prep
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  updateStatus.mutate({ id: order.id, status: "SERVED" })
                }
              >
                Served
              </Button>
            </div>
          </Card>
        ))}
        {(orders.data?.orders ?? []).length === 0 && (
          <p className="text-sm text-[var(--muted)]">No open tickets yet.</p>
        )}
      </div>
    </div>
  );
}
