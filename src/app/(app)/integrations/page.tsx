"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Connection = {
  id: string;
  provider: string;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type CatalogItem = {
  id: string;
  name: string;
  dishId: string | null;
  confidence: string | null;
  mappedBy: string | null;
  status: string | null;
};

type Dish = { id: string; name: string };

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Unauthorized");
      return body as { user: { role: string } };
    },
  });
  const isOwner = me.data?.user?.role === "OWNER";

  const data = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await fetch("/api/integrations");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load connections");
      return body as {
        connections: Connection[];
        catalog: CatalogItem[];
        dishes: Dish[];
        providers?: {
          square: boolean;
          clover: boolean;
          toast: boolean;
          quickbooks: boolean;
          delivery: boolean;
        };
      };
    },
  });

  const act = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      return body as { created?: boolean; externalLineId?: string };
    },
    onSuccess: async (body) => {
      setError(null);
      if (body.externalLineId) {
        setLastLine(body.externalLineId);
        setNotice(
          body.created
            ? "Sale recorded."
            : "That sale was already recorded. Nothing was added twice.",
        );
      } else {
        setNotice("Register updated.");
      }
      await qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const connections = data.data?.connections ?? [];
  const live = connections.find((row) => row.status === "connected");
  const unmapped = (data.data?.catalog ?? []).filter((row) => !row.dishId);
  const mapped = (data.data?.catalog ?? []).filter((row) => row.dishId);

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Connect a register
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Restman reads sales from the register you already use. It does not
          replace it.
        </p>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {notice && <p className="text-sm text-[var(--muted)]">{notice}</p>}

      <Card className="space-y-3">
        <CardTitle>Demo register</CardTitle>
        {live && isOwner ? (
          <>
            <p className="text-sm">
              Last synced{" "}
              {live.lastSyncedAt
                ? new Date(live.lastSyncedAt).toLocaleString()
                : "never"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({ action: "test-sale", connectionId: live.id })
                }
              >
                Send test sale
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={act.isPending || !lastLine}
                onClick={() =>
                  act.mutate({
                    action: "test-sale",
                    connectionId: live.id,
                    externalLineId: lastLine ?? "",
                  })
                }
              >
                Replay last sale
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({ action: "disconnect", connectionId: live.id })
                }
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : isOwner ? (
          <Button
            disabled={act.isPending}
            onClick={() => act.mutate({ action: "connect-demo" })}
          >
            Connect demo register
          </Button>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            {live ? "Connected. You can suggest a dish for unmapped items." : "The owner connects the register."}
          </p>
        )}
        <p className="text-xs text-[var(--muted)]">
          Square, Clover, and Toast use the same connector. They stay off until
          that app&apos;s keys are on the server.
        </p>
      </Card>

      <Card className="space-y-2">
        <CardTitle>Other accounts</CardTitle>
        {(["square", "clover", "toast", "quickbooks"] as const).map((provider) => {
          const ready = data.data?.providers?.[provider === "quickbooks" ? "quickbooks" : provider];
          const connected = connections.some(
            (row) => row.provider === provider && row.status === "connected",
          );
          return (
            <div key={provider} className="flex items-center justify-between text-sm">
              <span className="capitalize">{provider}</span>
              {connected ? (
                <Badge>Connected</Badge>
              ) : isOwner && ready ? (
                <a className="text-[var(--accent)]" href={`/api/integrations/oauth/${provider}`}>
                  Connect
                </a>
              ) : (
                <Badge>Needs keys</Badge>
              )}
            </div>
          );
        })}
        {isOwner && (
          <Button
            size="sm"
            variant="ghost"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: "connect-delivery" })}
          >
            Enable delivery sales
          </Button>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle>Needs a recipe</CardTitle>
          <Badge>{unmapped.length}</Badge>
        </div>
        {unmapped.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Every imported item is mapped, or nothing has synced yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {unmapped.map((item) => (
              <li key={item.id} className="space-y-2 text-sm">
                <p className="font-medium">{item.name}</p>
                <div className="flex gap-2">
                  <select
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2"
                    value={picks[item.id] ?? ""}
                    onChange={(e) =>
                      setPicks((current) => ({
                        ...current,
                        [item.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Choose a dish</option>
                    {(data.data?.dishes ?? []).map((dish) => (
                      <option key={dish.id} value={dish.id}>
                        {dish.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={act.isPending || !picks[item.id]}
                    onClick={() =>
                      act.mutate({
                        action: isOwner ? "map" : "suggest",
                        posItemId: item.id,
                        dishId: picks[item.id],
                      })
                    }
                  >
                    {isOwner ? "Map" : "Suggest"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {mapped.length > 0 && (
        <Card className="space-y-2">
          <CardTitle>Mapped</CardTitle>
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            {mapped.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span>
                {item.name}
                {item.mappedBy === "auto" ? " · auto" : item.status === "suggested" ? " · suggested" : " · owner"}
                </span>
                {isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act.mutate({ action: "unmap", posItemId: item.id })}
                  >
                    Unmap
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
