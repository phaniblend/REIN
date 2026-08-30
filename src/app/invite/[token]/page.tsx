"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RestmanLogo } from "@/components/restman-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InviteInfo = {
  status: "pending" | "accepted";
  phone: string;
  name: string | null;
  role: string;
  restaurantName: string;
  canContinue?: boolean;
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/invite/${token}`);
      const data = await res.json();
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? "Invite unavailable");
        return;
      }
      setInfo(data as InviteInfo);
      if (data.name) setName(data.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function joinOrContinue(action: "accept" | "continue") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "continue"
          ? { action: "continue" }
          : { action: "accept", name },
      ),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not continue");
      return;
    }
    router.push(data.redirectTo ?? "/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <RestmanLogo size={32} />
      </div>
      <Card className="animate-rise space-y-4">
        <div>
          <h1 className="text-xl font-medium text-[var(--accent)]">
            {info?.status === "accepted" ? "Welcome back" : "Join team"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {info?.status === "accepted"
              ? "Your invite link signs you back in — no extra login."
              : "Secure invite from your restaurant owner — no separate signup."}
          </p>
        </div>

        {loading && (
          <p className="text-sm text-[var(--muted)]">Loading invite…</p>
        )}

        {!loading && info?.status === "pending" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void joinOrContinue("accept");
            }}
            className="space-y-3"
          >
            <div className="rounded-2xl bg-[var(--tan)] px-3 py-3 text-sm">
              <p className="font-medium">{info.restaurantName}</p>
              <p className="text-[var(--muted)]">
                Role: {info.role} · {info.phone}
              </p>
            </div>
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Joining…" : "Accept & continue"}
            </Button>
          </form>
        )}

        {!loading && info?.status === "accepted" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[var(--tan)] px-3 py-3 text-sm">
              <p className="font-medium">{info.restaurantName}</p>
              <p className="text-[var(--muted)]">
                Role: {info.role} · {info.phone}
              </p>
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void joinOrContinue("continue")}
            >
              {busy ? "Signing in…" : "Continue to Restman"}
            </Button>
          </div>
        )}

        {!loading && !info && error && (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        )}
      </Card>
    </div>
  );
}
