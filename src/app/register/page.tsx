"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    restaurantName: "",
    cuisineType: "",
    city: "",
    region: "",
    country: "US",
    currency: "USD",
    ownerName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      return;
    }
    router.push("/menu");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 py-8">
      <p className="mb-4 font-[family-name:var(--font-display)] text-3xl font-semibold">
        Restman
      </p>
      <Card className="animate-rise space-y-4">
        <div>
          <h1 className="text-xl font-medium">Open with Restman</h1>
          <p className="text-sm text-[var(--muted)]">
            Owner account + restaurant profile for local cuisine benchmarks.
          </p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div>
            <Label>Restaurant name</Label>
            <Input
              value={form.restaurantName}
              onChange={(e) => set("restaurantName", e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Cuisine type</Label>
            <Input
              placeholder="e.g. North Indian, Mexican, Italian"
              value={form.cuisineType}
              onChange={(e) => set("cuisineType", e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>City</Label>
              <Input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Region / State</Label>
              <Input
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Country</Label>
              <Input
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label>Your name</Label>
            <Input
              value={form.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Password (min 8)</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create Restman account"}
          </Button>
        </form>
        <p className="text-sm text-[var(--muted)]">
          Already set up?{" "}
          <Link href="/login" className="text-[var(--accent)] underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
