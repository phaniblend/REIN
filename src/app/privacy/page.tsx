import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy" },
  description:
    "Privacy Policy for Restman, registered brand My Starter Profile. We do not sell or share SMS opt-in data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-5 py-10 text-sm leading-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        Privacy Policy
      </h1>
      <p>
        Restman, registered brand My Starter Profile, stores your restaurant
        name, staff names, mobile numbers, email addresses, menu, stock,
        tickets, invoices, and counts so the kitchen can run.
      </p>
      <p>
        We do not sell or share your SMS opt-in data or personal information
        with third parties for marketing purposes.
      </p>
      <p>
        Text codes are used to sign in and to invite staff. A code expires
        after 10 minutes. Invite links expire after 7 days and cannot be used
        again after someone joins.
      </p>
      <p>
        The owner can export this data or delete the restaurant. Test kitchens
        used to check the product are flagged and left out of area comparisons
        and scheduled digests.
      </p>
      <p>
        <Link href="/terms" className="underline">
          Terms of use
        </Link>
      </p>
    </main>
  );
}
