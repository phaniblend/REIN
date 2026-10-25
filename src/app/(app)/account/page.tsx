"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        Account
      </h1>
      <Card className="space-y-3">
        <CardTitle>Your data</CardTitle>
        <Button
          variant="secondary"
          onClick={async () => {
            const res = await fetch("/api/account");
            if (!res.ok) {
              setStatus("Only the owner can export.");
              return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "restman-export.json";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download export
        </Button>
      </Card>
      <Card className="space-y-3">
        <CardTitle>Delete restaurant</CardTitle>
        <p className="text-sm text-[var(--muted)]">
          This removes the menu, stock, tickets, and staff sign-in. It cannot
          be undone.
        </p>
        <div>
          <Label>Type the restaurant name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          variant="danger"
          disabled={!name.trim()}
          onClick={async () => {
            const res = await fetch("/api/account", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setStatus(data.error ?? "Could not delete");
              return;
            }
            window.location.href = "/login";
          }}
        >
          Delete restaurant
        </Button>
        {status && <p className="text-sm text-[var(--danger)]">{status}</p>}
      </Card>
    </div>
  );
}
