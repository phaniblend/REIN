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

function toLocalInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SchedulePage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [hourlyRate, setHourlyRate] = useState("15");
  const [editingId, setEditingId] = useState<string | null>(null);
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
        hasSales: boolean;
      };
    },
  });

  function resetForm() {
    setEditingId(null);
    setUserId("");
    setStartsAt("");
    setEndsAt("");
    setHourlyRate("15");
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/schedule", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? {
                id: editingId,
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
                hourlyRate: Number(hourlyRate),
              }
            : {
                userId,
                startsAt: new Date(startsAt).toISOString(),
                endsAt: new Date(endsAt).toISOString(),
                hourlyRate: Number(hourlyRate),
              },
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the shift");
      return body;
    },
    onSuccess: async () => {
      setError(null);
      resetForm();
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/schedule", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not delete the shift");
      return body;
    },
    onSuccess: async () => {
      setError(null);
      if (editingId) resetForm();
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const hasSales = Boolean(data.data?.hasSales);

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
          {hasSales
            ? `Prime ${data.data?.primePercent.toFixed(0)}%`
            : "Prime —"}
        </CardTitle>
        <p className="text-sm text-[var(--muted)]">
          {hasSales
            ? `Food ${data.data?.foodPercent.toFixed(0) ?? "—"}% · Labor ${data.data?.laborPercent.toFixed(0) ?? "—"}% · Sales $${((data.data?.salesCents ?? 0) / 100).toFixed(2)}`
            : `No sales yet today · Sales $0.00`}
        </p>
      </Card>
      <Card className="space-y-3">
        <CardTitle>{editingId ? "Edit shift" : "Add a shift"}</CardTitle>
        {!editingId && (
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
        )}
        <div className="space-y-1">
          <Label htmlFor="start">Start</Label>
          <Input
            id="start"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="end">End</Label>
          <Input
            id="end"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate">Hourly rate</Label>
          <Input
            id="rate"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={
              save.isPending ||
              (!editingId && !userId) ||
              !startsAt ||
              !endsAt
            }
            onClick={() => save.mutate()}
          >
            {editingId ? "Save changes" : "Save shift"}
          </Button>
          {editingId && (
            <Button variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          )}
        </div>
      </Card>
      <Card className="space-y-2">
        <CardTitle>Today</CardTitle>
        <ul className="space-y-2 text-sm">
          {(data.data?.shifts ?? []).map((shift) => (
            <li
              key={shift.id}
              className="flex items-center justify-between gap-2"
            >
              <span>
                {shift.name} · {formatTime(shift.startsAt)}–
                {formatTime(shift.endsAt)} · $
                {(Number(shift.hourlyRateCents) / 100).toFixed(2)}/hr
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(shift.id);
                    setUserId(shift.id);
                    setStartsAt(toLocalInput(shift.startsAt));
                    setEndsAt(toLocalInput(shift.endsAt));
                    setHourlyRate(
                      String(Number(shift.hourlyRateCents) / 100),
                    );
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(shift.id)}
                >
                  Delete
                </Button>
              </span>
            </li>
          ))}
          {(data.data?.shifts ?? []).length === 0 && (
            <li className="text-[var(--muted)]">No shifts yet today.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
