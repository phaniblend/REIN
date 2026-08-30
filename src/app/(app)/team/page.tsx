"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { copyText } from "@/lib/clipboard";
import { canPickContacts, pickContactsFromDevice } from "@/lib/contacts";

type TeamPayload = {
  team: {
    id: string;
    name: string;
    phone: string | null;
    role: string;
  }[];
  invites: {
    id: string;
    phone: string;
    name: string | null;
    role: string;
    link: string;
    expiresAt: string;
  }[];
};

type Role = "WAITER" | "CHEF" | "STOCK_CLERK";

type StagedContact = { phone: string; name: string };

export default function TeamPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("WAITER");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsOk, setSmsOk] = useState<boolean | null>(null);
  const [contactsSupported, setContactsSupported] = useState(false);
  const [picking, setPicking] = useState(false);
  const [staged, setStaged] = useState<StagedContact[]>([]);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  useEffect(() => {
    setContactsSupported(canPickContacts());
  }, []);

  const team = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const res = await fetch("/api/staff");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load team");
      return data as TeamPayload;
    },
  });

  const invite = useMutation({
    mutationFn: async (payload: {
      phone: string;
      name?: string;
      role: Role;
    }) => {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      return data as { link: string; smsOk: boolean; smsProvider: string };
    },
    onSuccess: (data) => {
      setLastLink(data.link);
      setSmsOk(data.smsOk);
      setError(null);
      setCopyNote(null);
      setPhone("");
      setName("");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove");
      return data;
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const bulkInvite = useMutation({
    mutationFn: async (contacts: StagedContact[]) => {
      const results: { phone: string; ok: boolean; error?: string; link?: string }[] =
        [];
      for (const c of contacts) {
        const res = await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: c.phone,
            name: c.name || undefined,
            role,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          results.push({
            phone: c.phone,
            ok: false,
            error: data.error ?? "Failed",
          });
        } else {
          results.push({ phone: c.phone, ok: true, link: data.link });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      setBulkNote(
        fail
          ? `Invited ${ok}, ${fail} failed — check numbers and try again.`
          : `Invited ${ok} from your contacts.`,
      );
      setStaged([]);
      setError(null);
      const lastOk = [...results].reverse().find((r) => r.ok && r.link);
      if (lastOk?.link) {
        setLastLink(lastOk.link);
        setSmsOk(true);
      }
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  async function copyLink(link: string) {
    const ok = await copyText(link);
    setCopyNote(ok ? "Link copied." : "Select and copy the link above.");
  }

  async function fromContacts() {
    setError(null);
    setBulkNote(null);
    setPicking(true);
    try {
      const picked = await pickContactsFromDevice({ multiple: true });
      if (!picked.length) {
        setError("No contacts with a phone number were selected.");
        return;
      }
      if (picked.length === 1) {
        setPhone(picked[0]!.phone);
        setName(picked[0]!.name);
        setStaged([]);
        return;
      }
      // Dedupe by phone
      const seen = new Set<string>();
      const unique = picked.filter((c) => {
        if (seen.has(c.phone)) return false;
        seen.add(c.phone);
        return true;
      });
      setStaged(unique);
      setPhone("");
      setName("");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
    } finally {
      setPicking(false);
    }
  }

  const busy = invite.isPending || bulkInvite.isPending || picking;

  return (
    <div className="animate-rise space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
          Team
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Invite staff from your contacts or by number — they open the link, no
          separate signup.
        </p>
      </div>

      <Card className="space-y-3">
        <CardTitle>Send invite</CardTitle>

        {contactsSupported ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => fromContacts()}
          >
            {picking ? "Opening contacts…" : "Pick from contacts"}
          </Button>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            Tip: on iPhone, tap Mobile and use the keyboard contact suggestions.
            Full contact picker works in Chrome on Android.
          </p>
        )}

        <div>
          <Label>Mobile</Label>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <Label>Name (optional)</Label>
          <Input
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya"
          />
        </div>
        <div>
          <Label>Role</Label>
          <select
            className="flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="WAITER">Waiter — take orders / mark served</option>
            <option value="CHEF">Chef — recipes & kitchen</option>
            <option value="STOCK_CLERK">Stock clerk — inventory</option>
          </select>
        </div>

        {staged.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-[var(--tan)] p-3">
            <p className="text-sm font-medium text-[var(--accent)]">
              {staged.length} contacts selected
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {staged.map((c) => (
                <li
                  key={c.phone}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate">
                    {c.name || "No name"} · {c.phone}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-[var(--muted)] underline"
                    onClick={() =>
                      setStaged((prev) => prev.filter((x) => x.phone !== c.phone))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              disabled={busy}
              onClick={() => bulkInvite.mutate(staged)}
            >
              {bulkInvite.isPending
                ? "Inviting…"
                : `Invite all as ${role.toLowerCase().replace("_", " ")}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setStaged([])}
            >
              Clear selection
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {bulkNote && <p className="text-sm text-[var(--muted)]">{bulkNote}</p>}

        {staged.length === 0 && (
          <Button
            disabled={!phone || busy}
            onClick={() =>
              invite.mutate({
                phone,
                name: name || undefined,
                role,
              })
            }
          >
            {invite.isPending ? "Sending…" : "Text invite link"}
          </Button>
        )}

        {lastLink && (
          <div className="rounded-2xl bg-[var(--tan)] p-3 text-sm">
            <p className="font-medium text-[var(--accent)]">Invite ready</p>
            <p className="mt-1 break-all text-[var(--muted)]">{lastLink}</p>
            <Button
              variant="secondary"
              className="mt-2"
              type="button"
              onClick={() => copyLink(lastLink)}
            >
              Copy link
            </Button>
            {copyNote && (
              <p className="mt-2 text-xs text-[var(--muted)]">{copyNote}</p>
            )}
            {smsOk === false && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                SMS may not have sent — share this link manually.
              </p>
            )}
          </div>
        )}
      </Card>

      {team.data?.invites && team.data.invites.length > 0 && (
        <Card className="space-y-2">
          <CardTitle>Pending invites</CardTitle>
          <ul className="space-y-2">
            {team.data.invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {i.name ?? i.phone} · {i.role}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">{i.phone}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => copyLink(i.link)}
                >
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-2">
        <CardTitle>Active team</CardTitle>
        <ul className="space-y-2">
          {(team.data?.team ?? []).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-[var(--muted)]">{m.phone ?? "—"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge>{m.role}</Badge>
                {m.role !== "OWNER" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove ${m.name} from the team? Their invite link will stop working.`,
                        )
                      ) {
                        return;
                      }
                      remove.mutate(m.id);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
