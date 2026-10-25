import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-5 py-10 text-sm leading-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        Privacy policy
      </h1>
      <p>
        Restman stores your restaurant name, staff names, mobile numbers,
        email addresses, menu, stock, tickets, invoices, and counts so the
        kitchen can run. We do not sell that information.
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
