"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export default function SupportPage() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        Report a problem
      </h1>
      <p className="text-sm text-[var(--muted)]">
        We read these during the pilot and reply within one business day.
      </p>
      <Card className="space-y-3">
        <CardTitle>What happened?</CardTitle>
        <textarea
          className="min-h-32 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Screen, what you tapped, and what you expected"
        />
        <Button
          disabled={pending || message.trim().length < 8}
          onClick={async () => {
            setPending(true);
            setStatus(null);
            const res = await fetch("/api/support", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message }),
            });
            const data = await res.json().catch(() => ({}));
            setPending(false);
            if (!res.ok) {
              setStatus(data.error ?? "Could not send that. Try again.");
              return;
            }
            setMessage("");
            setStatus("Sent. We'll reply within one business day.");
          }}
        >
          {pending ? "Sending…" : "Send"}
        </Button>
        {status && <p className="text-sm text-[var(--muted)]">{status}</p>}
      </Card>
    </div>
  );
}
