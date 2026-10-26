import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 py-16 text-sm">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--accent)]">
        That link is not on Restman
      </h1>
      <p className="mt-3 leading-6 text-[var(--muted)]">
        The address does not match a page. You can open the sign-up form, the
        privacy policy, or the terms.
      </p>
      <p className="mt-4">
        <Link href="/register" className="underline">
          Register
        </Link>
        {" · "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>
      </p>
    </main>
  );
}
