"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RestmanLogo } from "@/components/restman-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InviteInfo = {
  phone: string;
  name: string | null;
  role: string;
  restaurantName: string;
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

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

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setAccepting(true);
    setError(null);
    const res = await fetch(`/api/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setAccepting(false);
    if (!res.ok) {
      setError(data.error ?? "Could not join");
      return;
    }
    const role = data.user?.role as string | undefined;
    if (role === "CHEF") router.push("/orders");
    else if (role === "WAITER") router.push("/orders");
    else router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <RestmanLogo size={32} />
      </div>
      <Card className="animate-rise space-y-4">
        <div>
          <h1 className="text-xl font-medium text-[var(--accent)]">Join team</h1>
          <p className="text-sm text-[var(--muted)]">
            Secure invite from your restaurant owner — no separate signup.
          </p>
        </div>

        {loading && <p className="text-sm text-[var(--muted)]">Loading invite…</p>}

        {!loading && info && (
          <form onSubmit={accept} className="space-y-3">
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
            <Button type="submit" className="w-full" disabled={accepting}>
              {accepting ? "Joining…" : "Accept & continue"}
            </Button>
          </form>
        )}

        {!loading && !info && error && (
          <p className="text-sm text-[var(--danger)]">{error}</p>
        )}
      </Card>
    </div>
  );
}
