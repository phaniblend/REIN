"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { money, num } from "@/lib/utils";

type RecipeLine = {
  ingredientId: string;
  grossQuantity: string;
  shrinkageMarginPercent: string;
  ingredientName: string;
  ingredientUnit: string;
};

type MenuItem = {
  id: string;
  name: string;
  category: string;
  sellingPrice: string;
  isActive: boolean;
  menuApprovalStatus: string;
  recipeApprovalStatus: string;
  chefSignedAt: string | null;
  recipe: RecipeLine[];
};

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  category: string;
};

type EditLine = {
  key: string;
  ingredientId: string;
  name: string;
  unit: string;
  grossQuantity: string;
};

function needsChefRecipe(item: MenuItem) {
  if (item.isActive === false) return false;
  if (item.menuApprovalStatus !== "APPROVED") return false;
  // Chef has signed → done
  if (item.chefSignedAt) return false;
  if (item.recipeApprovalStatus === "REJECTED") return false;
  return true;
}

export default function RecipesPage() {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("G");
  const [repaired, setRepaired] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unauthorized");
      return data as { user: { role: string } };
    },
  });

  const isChef = me.data?.user?.role === "CHEF";
  const isOwner = me.data?.user?.role === "OWNER";

  const menu = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const res = await fetch("/api/menu");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load menu");
      return data as { menuItems: MenuItem[] };
    },
  });

  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load ingredients");
      return data as { ingredients: Ingredient[] };
    },
    enabled: isChef,
  });

  // Recover dishes wrongly auto-approved with the menu (no chef signature yet).
  useEffect(() => {
    if (repaired || !isChef) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/menu/reopen-recipes", { method: "POST" });
      if (cancelled) return;
      setRepaired(true);
      if (res.ok) {
        const data = (await res.json()) as { reopened?: number };
        if ((data.reopened ?? 0) > 0) {
          qc.invalidateQueries({ queryKey: ["menu"] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc, repaired, isChef]);

  const save = useMutation({
    mutationFn: async ({
      id,
      finalize,
    }: {
      id: string;
      finalize: boolean;
    }) => {
      const payloadLines = lines
        .filter((l) => Number(l.grossQuantity) > 0 && (l.ingredientId || l.name))
        .map((l) =>
          l.ingredientId
            ? {
                ingredientId: l.ingredientId,
                grossQuantity: Number(l.grossQuantity),
                shrinkageMarginPercent: 5,
              }
            : {
                name: l.name,
                unit: l.unit as "KG" | "G" | "L" | "ML" | "PIECE" | "PACKET",
                category: "General",
                grossQuantity: Number(l.grossQuantity),
                shrinkageMarginPercent: 5,
              },
        );
      if (!payloadLines.length) {
        throw new Error("Add at least one grocery item with quantity");
      }
      const res = await fetch(`/api/menu/${id}/recipe`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payloadLines, finalize }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save recipe");
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["menu"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      setMessage(
        vars.finalize
          ? "Dish recipe finalized."
          : "Recipe saved — finalize when quantities look right.",
      );
      if (vars.finalize) setOpenId(null);
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const items = menu.data?.menuItems ?? [];
  const pending = useMemo(() => items.filter(needsChefRecipe), [items]);
  const waitingOnOwner = useMemo(
    () =>
      items.filter(
        (i) =>
          i.isActive !== false &&
          i.menuApprovalStatus !== "APPROVED" &&
          i.menuApprovalStatus !== "REJECTED",
      ),
    [items],
  );
  // Only chef-signed dishes count as done (owner finalize must not lock these).
  const done = useMemo(
    () =>
      items.filter(
        (i) =>
          i.isActive !== false &&
          i.menuApprovalStatus === "APPROVED" &&
          Boolean(i.chefSignedAt),
      ),
    [items],
  );

  const editableMenu = useMemo(
    () =>
      items.filter(
        (i) =>
          i.isActive !== false &&
          i.menuApprovalStatus === "APPROVED" &&
          i.recipeApprovalStatus !== "REJECTED",
      ),
    [items],
  );

  const groupedEditable = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of editableMenu) {
      const key = item.category?.trim() || "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [editableMenu]);

  function openDish(item: MenuItem) {
    if (!isChef) return;
    setOpenId(item.id);
    setMessage(null);
    setLines(
      (item.recipe ?? []).map((r, idx) => ({
        key: `${r.ingredientId}-${idx}`,
        ingredientId: r.ingredientId,
        name: r.ingredientName,
        unit: r.ingredientUnit,
        grossQuantity: String(num(r.grossQuantity) || ""),
      })),
    );
    setNewName("");
    setNewQty("");
  }

  function addExisting(ingredientId: string) {
    const ing = ingredients.data?.ingredients.find((i) => i.id === ingredientId);
    if (!ing) return;
    if (lines.some((l) => l.ingredientId === ing.id)) return;
    setLines((prev) => [
      ...prev,
      {
        key: `${ing.id}-${Date.now()}`,
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        grossQuantity: "",
      },
    ]);
  }

  function addCustom() {
    if (!newName.trim() || !(Number(newQty) > 0)) return;
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        ingredientId: "",
        name: newName.trim(),
        unit: newUnit,
        grossQuantity: newQty,
      },
    ]);
    setNewName("");
    setNewQty("");
  }

  return (
    <div className="animate-rise space-y-4 pb-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          {isOwner ? "Recipe progress" : "Owner-approved menu"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {isOwner
            ? "You finalize dishes on Menu. Only the chef can set grocery recipes and re-edit them."
            : "Tap a dish, set grocery items and quantities for one portion, then finalize. You can re-edit anytime."}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {done.length} recipes done · {pending.length} awaiting chef
        </p>
      </div>

      {waitingOnOwner.length > 0 && (
        <Card className="space-y-1">
          <CardTitle>Waiting on owner</CardTitle>
          <p className="text-sm text-[var(--muted)]">
            {waitingOnOwner.length} dish
            {waitingOnOwner.length === 1 ? "" : "es"} not finalized by the owner
            yet. They’ll show up here after menu finalize.
          </p>
        </Card>
      )}

      {pending.length === 0 &&
        waitingOnOwner.length === 0 &&
        done.length > 0 && (
          <Card className="space-y-2">
            <CardTitle>All recipes finalized</CardTitle>
            <p className="text-sm text-[var(--muted)]">
              Tap any dish below to revise ingredients anytime.
            </p>
            <Link
              href="/orders"
              className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)]"
            >
              Go to kitchen queue
            </Link>
          </Card>
        )}

      {items.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          No menu yet — ask the owner to generate and finalize the menu first.
        </p>
      )}

      {message && <p className="text-sm text-[var(--muted)]">{message}</p>}

      <div className="space-y-6">
        {groupedEditable.map(([category, categoryItems]) => (
          <section key={category} className="space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--accent)]">
              {category}
            </h2>
            {categoryItems.map((item) => {
              const open = isChef && openId === item.id;
              const signed = Boolean(item.chefSignedAt);
              return (
                <Card
                  key={item.id}
                  className={`space-y-3 ${open ? "ring-1 ring-[var(--accent)]" : ""}`}
                >
                  {isChef ? (
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => (open ? setOpenId(null) : openDish(item))}
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {money(num(item.sellingPrice))} ·{" "}
                          {(item.recipe?.length ?? 0) > 0
                            ? `${item.recipe.length} ingredient${item.recipe.length === 1 ? "" : "s"}`
                            : "No recipe yet"}
                        </p>
                      </div>
                      <Badge>
                        {open
                          ? "Editing"
                          : signed
                            ? "Tap to revise"
                            : (item.recipe?.length ?? 0) > 0
                              ? "Tap to edit"
                              : "Tap to add"}
                      </Badge>
                    </button>
                  ) : (
                    <div className="flex w-full items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {money(num(item.sellingPrice))} ·{" "}
                          {(item.recipe?.length ?? 0) > 0
                            ? `${item.recipe.length} ingredient${item.recipe.length === 1 ? "" : "s"}`
                            : "No recipe yet"}
                        </p>
                      </div>
                      <Badge>{signed ? "Chef finalized" : "Awaiting chef"}</Badge>
                    </div>
                  )}

                  {open && (
                    <div className="space-y-3 border-t border-[var(--border)] pt-3">
                      {lines.map((line) => (
                        <div
                          key={line.key}
                          className="grid grid-cols-[1fr_88px_auto] items-end gap-2"
                        >
                          <div>
                            <Label>Grocery</Label>
                            <Input value={line.name} readOnly />
                          </div>
                          <div>
                            <Label>Qty ({line.unit})</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={line.grossQuantity}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.key === line.key
                                      ? { ...l, grossQuantity: e.target.value }
                                      : l,
                                  ),
                                )
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((l) => l.key !== line.key),
                              )
                            }
                          >
                            ✕
                          </Button>
                        </div>
                      ))}

                      <div className="space-y-2 rounded-2xl bg-[var(--tan)] p-3">
                        <p className="text-xs font-medium text-[var(--accent)]">
                          Add grocery item
                        </p>
                        <select
                          className="flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) addExisting(e.target.value);
                            e.target.value = "";
                          }}
                        >
                          <option value="">Pick from stock list…</option>
                          {(ingredients.data?.ingredients ?? []).map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} ({ing.unit})
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-[1fr_72px_72px] gap-2">
                          <Input
                            placeholder="Or new item name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            placeholder="Qty"
                            value={newQty}
                            onChange={(e) => setNewQty(e.target.value)}
                          />
                          <select
                            className="flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                            value={newUnit}
                            onChange={(e) => setNewUnit(e.target.value)}
                          >
                            {["G", "KG", "ML", "L", "PIECE", "PACKET"].map(
                              (u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={addCustom}
                        >
                          Add line
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          disabled={save.isPending}
                          onClick={() =>
                            save.mutate({ id: item.id, finalize: false })
                          }
                        >
                          Save draft
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          disabled={save.isPending}
                          onClick={() =>
                            save.mutate({ id: item.id, finalize: true })
                          }
                        >
                          {save.isPending ? "Saving…" : "Finalize dish"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
