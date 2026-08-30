"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { money, num } from "@/lib/utils";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  sellingPrice: string;
  isActive: boolean;
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

const CATEGORY_SUGGESTIONS = [
  "Appetizers",
  "Soups & Salads",
  "Main Course — Veg",
  "Main Course — Non-Veg",
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

function statusLabel(status: string) {
  if (status === "APPROVED") return "Finalized";
  if (status === "PENDING_APPROVAL") return "Pending";
  if (status === "REJECTED") return "Rejected";
  return "Draft";
}

export default function MenuPage() {
  const qc = useQueryClient();
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    sellingPrice: "",
  });
  const [addForm, setAddForm] = useState({
    name: "",
    category: "Appetizers",
    sellingPrice: "",
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

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

  const addItem = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          category: addForm.category.trim(),
          sellingPrice: Number(addForm.sellingPrice),
          recipe: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add dish");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      setAddForm({ name: "", category: "Appetizers", sellingPrice: "" });
      setShowAdd(false);
      setMessage("Dish added as draft — finalize when ready.");
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const saveEdit = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          category: editForm.category.trim(),
          sellingPrice: Number(editForm.sellingPrice),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      setEditingId(null);
      setMessage("Dish updated.");
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const approveOne = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      setMessage("Dish finalized.");
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/menu/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      setMessage("Dish removed.");
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/menu/finalize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to finalize");
      return data as { finalized: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      setMessage(
        `Menu finalized — ${data.finalized} dish${data.finalized === 1 ? "" : "es"} ready for POS.`,
      );
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const items = menu.data?.menuItems ?? [];
  const visible = items.filter((i) => showInactive || i.isActive !== false);
  const pendingCount = items.filter(
    (i) =>
      i.isActive !== false &&
      (i.menuApprovalStatus === "PENDING_APPROVAL" ||
        i.menuApprovalStatus === "DRAFT"),
  ).length;
  const approvedCount = items.filter(
    (i) => i.isActive !== false && i.menuApprovalStatus === "APPROVED",
  ).length;

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of visible) {
      const key = item.category?.trim() || "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => categorySortKey(a) - categorySortKey(b),
    );
  }, [visible]);

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      category: item.category,
      sellingPrice: String(num(item.sellingPrice)),
    });
    setMessage(null);
  }

  const busy =
    generate.isPending ||
    addItem.isPending ||
    saveEdit.isPending ||
    approveOne.isPending ||
    removeItem.isPending ||
    finalize.isPending;

  return (
    <div className="animate-rise space-y-4 pb-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Menu & recipes
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Generate, edit, and finalize dishes before they appear on POS.
        </p>
        {items.length > 0 && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {approvedCount} finalized · {pendingCount} awaiting approval ·{" "}
            {items.length} total
          </p>
        )}
      </div>

      {pendingCount > 0 && (
        <Card className="space-y-3 border-[var(--accent)]/30">
          <CardTitle>Ready to finalize?</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            Review prices and names below, then finalize so waiters can punch
            these dishes on POS.
          </p>
          <Button
            onClick={() => {
              setMessage(null);
              finalize.mutate();
            }}
            disabled={busy}
          >
            {finalize.isPending
              ? "Finalizing…"
              : `Finalize menu (${pendingCount})`}
          </Button>
        </Card>
      )}

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
          disabled={busy}
          variant="secondary"
        >
          {generate.isPending
            ? "Generating full menu… (1–2 min)"
            : "Generate recommended menu"}
        </Button>
        <p className="text-xs text-[var(--muted)]">
          Regenerating replaces pending/draft dishes only — finalized ones stay.
        </p>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Add dish</CardTitle>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => setShowAdd((v) => !v)}
          >
            {showAdd ? "Cancel" : "Add"}
          </Button>
        </div>
        {showAdd && (
          <div className="grid gap-2">
            <div>
              <Label>Name</Label>
              <Input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Paneer Butter Masala"
              />
            </div>
            <div>
              <Label>Category</Label>
              <select
                className="flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={addForm.category}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, category: e.target.value }))
                }
              >
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Selling price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={addForm.sellingPrice}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, sellingPrice: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <Button
              type="button"
              disabled={
                busy ||
                !addForm.name.trim() ||
                !addForm.sellingPrice ||
                Number(addForm.sellingPrice) <= 0
              }
              onClick={() => {
                setMessage(null);
                addItem.mutate();
              }}
            >
              {addItem.isPending ? "Adding…" : "Save dish"}
            </Button>
          </div>
        )}
      </Card>

      {message && <p className="text-sm text-[var(--muted)]">{message}</p>}

      {items.some((i) => i.isActive === false) && (
        <button
          type="button"
          className="text-xs text-[var(--muted)] underline"
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? "Hide inactive dishes" : "Show inactive dishes"}
        </button>
      )}

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
            {categoryItems.map((item) => {
              const editing = editingId === item.id;
              return (
                <Card
                  key={item.id}
                  className={`space-y-2 ${item.isActive === false ? "opacity-60" : ""}`}
                >
                  {editing ? (
                    <div className="grid gap-2">
                      <Input
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="Name"
                      />
                      <Input
                        value={editForm.category}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            category: e.target.value,
                          }))
                        }
                        placeholder="Category"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.sellingPrice}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            sellingPrice: e.target.value,
                          }))
                        }
                        placeholder="Price"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busy || !editForm.name.trim()}
                          onClick={() => saveEdit.mutate(item.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{item.name}</p>
                        <p className="shrink-0 font-[family-name:var(--font-display)]">
                          {money(num(item.sellingPrice))}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge>{statusLabel(item.menuApprovalStatus)}</Badge>
                        <Badge>{item.recipe?.length ?? 0} ingredients</Badge>
                        {item.isActive === false && <Badge>Inactive</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </Button>
                        {item.menuApprovalStatus !== "APPROVED" &&
                          item.isActive !== false && (
                            <Button
                              size="sm"
                              variant="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setMessage(null);
                                approveOne.mutate(item.id);
                              }}
                            >
                              Finalize
                            </Button>
                          )}
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Remove “${item.name}” from the menu?`,
                              )
                            ) {
                              return;
                            }
                            setMessage(null);
                            removeItem.mutate(item.id);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </section>
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No menu yet — generate a recommended menu or add a dish to get
            started.
          </p>
        )}
      </div>
    </div>
  );
}
