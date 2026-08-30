"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Package,
  Scale,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RestmanLogo } from "@/components/restman-logo";

const links = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inventory", label: "Stock", icon: Package },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "POS", icon: ClipboardList },
  { href: "/shifts", label: "Count", icon: Scale },
  { href: "/wastage", label: "Waste", icon: Trash2 },
  { href: "/insights", label: "Area", icon: MapPinned },
];

export function AppShell({
  children,
  userName,
  restaurantName,
}: {
  children: React.ReactNode;
  userName: string;
  restaurantName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col pb-24">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <RestmanLogo size={26} />
            <p className="mt-1 truncate text-xs text-[var(--muted)]">
              {restaurantName} · {userName}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto grid max-w-lg grid-cols-7 gap-0.5 px-1 py-1.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px]",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
