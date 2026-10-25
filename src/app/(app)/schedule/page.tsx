"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Shift = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  hourlyRateCents: string;
};

type Staff = { id: string; name: string; role: string };

export default function SchedulePage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [hourlyRate, setHourlyRate] = useState("15");
  const [error, setError] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["schedule"],
    queryFn: async () => {
      const res = await fetch("/api/schedule");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load the schedule");
      return body as {
        shifts: Shift[];
        staff: Staff[];
        laborPercent: number;
        foodPercent: number;
        primePercent: number;
        salesCents: number;
      };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          hourlyRate: Number(hourlyRate),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the shift");
      return body;
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Labor
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Today&apos;s labor plus food cost is prime cost.
        </p>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <Card className="space-y-1">
        <CardTitle>
          Prime {data.data ? `${data.data.primePercent.toFixed(0)}%` : "—"}
        </CardTitle>
        <p className="text-sm text-[var(--muted)]">
          Food {data.data?.foodPercent.toFixed(0) ?? "—"}% · Labor{" "}
          {data.data?.laborPercent.toFixed(0) ?? "—"}% · Sales $
          {((data.data?.salesCents ?? 0) / 100).toFixed(2)}
        </p>
      </Card>
      <Card className="space-y-3">
        <CardTitle>Add a shift</CardTitle>
        <div className="space-y-1">
          <Label htmlFor="staff">Staff</Label>
          <select
            id="staff"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Choose someone</option>
            {(data.data?.staff ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.role.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="start">Start</Label>
          <Input id="start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="end">End</Label>
          <Input id="end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate">Hourly rate</Label>
          <Input id="rate" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
        </div>
        <Button disabled={save.isPending || !userId || !startsAt || !endsAt} onClick={() => save.mutate()}>
          Save shift
        </Button>
      </Card>
      <Card className="space-y-2">
        <CardTitle>Today</CardTitle>
        <ul className="space-y-1 text-sm">
          {(data.data?.shifts ?? []).map((shift) => (
            <li key={shift.id}>
              {shift.name} · {new Date(shift.startsAt).toLocaleTimeString()}–
              {new Date(shift.endsAt).toLocaleTimeString()} · $
              {(Number(shift.hourlyRateCents) / 100).toFixed(2)}/hr
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
