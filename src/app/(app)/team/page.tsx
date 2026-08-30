"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { copyText } from "@/lib/clipboard";

type TeamPayload = {
  team: {
    id: string;
    name: string;
    phone: string | null;
    role: string;
  }[];
  invites: {
    id: string;
    phone: string;
    name: string | null;
    role: string;
    link: string;
    expiresAt: string;
  }[];
};

export default function TeamPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"WAITER" | "CHEF" | "STOCK_CLERK">("WAITER");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsOk, setSmsOk] = useState<boolean | null>(null);

  const team = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const res = await fetch("/api/staff");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load team");
      return data as TeamPayload;
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: name || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      return data as { link: string; smsOk: boolean; smsProvider: string };
    },
    onSuccess: (data) => {
      setLastLink(data.link);
      setSmsOk(data.smsOk);
      setError(null);
      setCopyNote(null);
      setPhone("");
      setName("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  async function copyLink(link: string) {
    const ok = await copyText(link);
    setCopyNote(ok ? "Link copied." : "Select and copy the link above.");
  }

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Team
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Invite staff by text — they open the link, no separate signup.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Send invite</CardTitle>
        <div>
          <Label>Mobile</Label>
          <Input
            type="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <Label>Name (optional)</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya"
          />
        </div>
        <div>
          <Label>Role</Label>
          <select
            className="flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "WAITER" | "CHEF" | "STOCK_CLERK")
            }
          >
            <option value="WAITER">Waiter — take orders / mark served</option>
            <option value="CHEF">Chef — recipes & kitchen</option>
            <option value="STOCK_CLERK">Stock clerk — inventory</option>
          </select>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <Button
          disabled={!phone || invite.isPending}
          onClick={() => invite.mutate()}
        >
          {invite.isPending ? "Sending…" : "Text invite link"}
        </Button>
        {lastLink && (
          <div className="rounded-2xl bg-[var(--tan)] p-3 text-sm">
            <p className="font-medium text-[var(--accent)]">Invite ready</p>
            <p className="mt-1 break-all text-[var(--muted)]">{lastLink}</p>
            <Button
              variant="secondary"
              className="mt-2"
              type="button"
              onClick={() => copyLink(lastLink)}
            >
              Copy link
            </Button>
            {copyNote && (
              <p className="mt-2 text-xs text-[var(--muted)]">{copyNote}</p>
            )}
            {smsOk === false && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                SMS may not have sent — share this link manually.
              </p>
            )}
          </div>
        )}
      </Card>

      {team.data?.invites && team.data.invites.length > 0 && (
        <Card className="space-y-2">
          <CardTitle>Pending invites</CardTitle>
          <ul className="space-y-2">
            {team.data.invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {i.name ?? i.phone} · {i.role}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">{i.phone}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => copyLink(i.link)}
                >
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-2">
        <CardTitle>Active team</CardTitle>
        <ul className="space-y-2">
          {(team.data?.team ?? []).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-[var(--muted)]">{m.phone ?? "—"}</p>
              </div>
              <Badge>{m.role}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
