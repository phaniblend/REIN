import type { Metadata } from "next";
import Link from "next/link";
import { RestmanLogo } from "@/components/restman-logo";

export const metadata: Metadata = {
  title: { absolute: "Staff invite" },
  description:
    "Sample Restman staff invite. River Cafe invited you as chef. Registered brand My Starter Profile.",
};

export default function SampleInvitePage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <RestmanLogo size={32} />
      </div>
      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_0_rgba(38,71,53,0.04)]">
        <div>
          <h1 className="text-xl font-medium text-[var(--accent)]">Join team</h1>
          <p className="text-sm text-[var(--muted)]">
            River Cafe invited you as chef on Restman.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--tan)] px-3 py-3 text-sm">
          <p className="font-medium">River Cafe</p>
          <p className="text-[var(--muted)]">Role: chef</p>
        </div>
        <p className="text-sm leading-6">
          Restman, registered brand My Starter Profile, sends this link only
          after the restaurant owner types your mobile number and sends the
          invite text. Opening this page does not opt you in and does not
          create an account.
        </p>
        <p className="text-sm leading-6">
          Message and data rates may apply. Reply STOP to opt out and HELP for
          help.
        </p>
        <p className="text-sm">
          <Link href="/terms" className="underline">
            Terms of Service
          </Link>
          {" · "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
        </p>
      </section>
    </main>
  );
}
