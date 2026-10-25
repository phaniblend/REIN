"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Log = {
  id: string;
  kind: string;
  reading: string;
  note: string | null;
  photo: string | null;
  createdAt: string;
  userName: string;
};

export default function SafetyPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"fridge_temp" | "checklist">("fridge_temp");
  const [reading, setReading] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const logs = useQuery({
    queryKey: ["safety"],
    queryFn: async () => {
      const res = await fetch("/api/safety");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load logs");
      return data as { logs: Log[] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, reading, note, photo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      return data;
    },
    onSuccess: async () => {
      setReading("");
      setNote("");
      setPhoto(undefined);
      setError(null);
      await qc.invalidateQueries({ queryKey: ["safety"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Food safety
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Fridge temperatures and open or close checks for the last seven days.
        </p>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <Card className="space-y-3">
        <CardTitle>Log</CardTitle>
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as "fridge_temp" | "checklist")}
        >
          <option value="fridge_temp">Fridge temperature</option>
          <option value="checklist">Open / close check</option>
        </select>
        <div className="space-y-1">
          <Label htmlFor="reading">Reading</Label>
          <Input
            id="reading"
            value={reading}
            onChange={(event) => setReading(event.target.value)}
            placeholder={kind === "fridge_temp" ? "38 F" : "Cooler closed"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="note">Note</Label>
          <Input id="note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="proof">Photo</Label>
          <input
            id="proof"
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = String(reader.result ?? "");
                const splitAt = result.indexOf(",");
                setPhoto(splitAt >= 0 ? result.slice(splitAt + 1) : result);
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>
        <Button disabled={save.isPending || !reading.trim()} onClick={() => save.mutate()}>
          Save log
        </Button>
      </Card>
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle>This week</CardTitle>
          <Link href="/safety/print" className="text-sm text-[var(--accent)]">
            Print for inspection
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {(logs.data?.logs ?? []).map((log) => (
            <li key={log.id}>
              <p className="font-medium">
                {log.kind === "fridge_temp" ? "Fridge" : "Check"} · {log.reading}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {log.userName} · {new Date(log.createdAt).toLocaleString()}
                {log.note ? ` · ${log.note}` : ""}
              </p>
              {log.photo && (
                <img
                  alt="Proof"
                  className="mt-1 max-h-32 rounded-lg"
                  src={`data:image/jpeg;base64,${log.photo}`}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
