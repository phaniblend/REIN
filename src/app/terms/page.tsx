import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-5 py-10 text-sm leading-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        Terms of use
      </h1>
      <p>
        Restman is a back-of-house tool for stock, recipes, and kitchen counts.
        It does not take card payments and it does not replace your register.
      </p>
      <p>
        You are responsible for the staff you invite and for the stock and
        sales figures you enter. A free pilot does not include a paid plan.
        When paid plans are turned on, an unpaid account can be limited.
      </p>
      <p>
        You can export your restaurant data or delete the restaurant from
        Account. Deleting a restaurant removes its menu, stock, tickets, and
        staff access.
      </p>
      <p>
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
      </p>
    </main>
  );
}
