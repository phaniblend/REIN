"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RestmanLogo } from "@/components/restman-logo";

type Step = "details" | "code";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState({
    restaurantName: "",
    cuisineType: "",
    city: "",
    region: "",
    country: "US",
    currency: "USD",
    ownerName: "",
    phone: "",
    email: "",
  });
  const [code, setCode] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevCode(null);
    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "register",
        phone: form.phone,
        restaurantName: form.restaurantName,
        cuisineType: form.cuisineType,
        city: form.city,
        region: form.region,
        country: form.country,
        currency: form.currency,
        ownerName: form.ownerName,
        email: form.email || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not send code");
      return;
    }
    setPhoneMasked(data.phoneMasked ?? form.phone);
    if (data.devCode) setDevCode(data.devCode);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: form.phone,
        code,
        purpose: "register",
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Invalid code");
      return;
    }
    router.push("/menu");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 py-8">
      <div className="mb-4">
        <RestmanLogo size={32} />
      </div>
      <Card className="animate-rise space-y-4">
        <div>
          <h1 className="text-xl font-medium text-[var(--accent)]">
            Open with Restman
          </h1>
          <p className="text-sm text-[var(--muted)]">
            We’ll text a code to confirm you’re the owner.
          </p>
        </div>

        {step === "details" ? (
          <form onSubmit={sendCode} className="grid gap-3">
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
              <Label>Mobile number</Label>
              <Input
                type="tel"
                autoComplete="tel"
                placeholder="+1 555 123 4567"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Sending code…" : "Text me a verification code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Enter the code we sent to {phoneMasked}.
            </p>
            {devCode && (
              <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
                Dev mode — code: <strong>{devCode}</strong>
              </p>
            )}
            <div>
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating…" : "Verify & create account"}
            </Button>
            <button
              type="button"
              className="text-sm text-[var(--muted)] underline"
              onClick={() => {
                setStep("details");
                setCode("");
                setDevCode(null);
                setError(null);
              }}
            >
              Edit details
            </button>
          </form>
        )}

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
