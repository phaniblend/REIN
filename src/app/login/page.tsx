"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { RestmanLogo } from "@/components/restman-logo";

type Mode = "phone" | "email";
type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("phone");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDevCode(null);
    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "login" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not send code");
      return;
    }
    setPhoneMasked(data.phoneMasked ?? phone);
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
      body: JSON.stringify({ phone, code, purpose: "login" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Invalid code");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Login failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <RestmanLogo size={32} />
      </div>
      <Card className="animate-rise space-y-4">
        <div>
          <h1 className="text-xl font-medium text-[var(--accent)]">Sign in</h1>
          <p className="text-sm text-[var(--muted)]">
            Owners: verify with a text message.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={
              mode === "phone"
                ? "font-medium text-[var(--accent)] underline"
                : "text-[var(--muted)]"
            }
            onClick={() => {
              setMode("phone");
              setError(null);
            }}
          >
            Mobile
          </button>
          <span className="text-[var(--muted)]">·</span>
          <button
            type="button"
            className={
              mode === "email"
                ? "font-medium text-[var(--accent)] underline"
                : "text-[var(--muted)]"
            }
            onClick={() => {
              setMode("email");
              setError(null);
            }}
          >
            Email
          </button>
        </div>

        {mode === "phone" && step === "phone" && (
          <form onSubmit={sendCode} className="space-y-3">
            <div>
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+1 555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Use country code. US/CA 10-digit numbers default to +1.
              </p>
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Text me a code"}
            </Button>
          </form>
        )}

        {mode === "phone" && step === "code" && (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              Code sent to {phoneMasked}.
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
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
            <button
              type="button"
              className="text-sm text-[var(--muted)] underline"
              onClick={() => {
                setStep("phone");
                setCode("");
                setDevCode(null);
                setError(null);
              }}
            >
              Use a different number
            </button>
          </form>
        )}

        {mode === "email" && (
          <form onSubmit={emailLogin} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}

        <p className="text-sm text-[var(--muted)]">
          New restaurant?{" "}
          <Link href="/register" className="text-[var(--accent)] underline">
            Register with Restman
          </Link>
        </p>
      </Card>
    </div>
  );
}
