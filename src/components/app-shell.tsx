"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Building2,
  CalendarClock,
  ClipboardList,
  Ellipsis,
  FileText,
  LayoutDashboard,
  Plug,
  LogOut,
  MapPinned,
  Package,
  Scale,
  ShoppingCart,
  Thermometer,
  Trash2,
  Users,
  UtensilsCrossed,
  ChefHat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RestmanLogo } from "@/components/restman-logo";
import type { UserRole } from "@/lib/roles";
import { LAUNCH_EXTRA_HREFS, showLaunchExtras } from "@/lib/launch";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
};

const allLinks: NavLink[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    roles: ["OWNER", "WAITER", "STOCK_CLERK"],
  },
  {
    href: "/recipes",
    label: "Recipes",
    icon: LayoutDashboard,
    roles: ["CHEF"],
  },
  { href: "/team", label: "Team", icon: Users, roles: ["OWNER"] },
  { href: "/integrations", label: "Connect", icon: Plug, roles: ["OWNER"] },
  {
    href: "/invoices",
    label: "Invoices",
    icon: FileText,
    roles: ["OWNER"],
  },
  {
    href: "/purchasing",
    label: "Buy",
    icon: ShoppingCart,
    roles: ["OWNER"],
  },
  { href: "/prep", label: "Prep", icon: ClipboardList, roles: ["OWNER"] },
  { href: "/schedule", label: "Labor", icon: CalendarClock, roles: ["OWNER"] },
  { href: "/safety", label: "Safety", icon: Thermometer, roles: ["OWNER"] },
  { href: "/places", label: "Places", icon: Building2, roles: ["OWNER"] },
  { href: "/inventory", label: "Stock", icon: Package },
  {
    href: "/recipes",
    label: "Recipes",
    icon: ChefHat,
    roles: ["OWNER"],
  },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, roles: ["OWNER"] },
  {
    href: "/orders",
    label: "Kitchen",
    icon: ClipboardList,
    roles: ["CHEF"],
  },
  {
    href: "/orders",
    label: "POS",
    icon: ClipboardList,
    roles: ["OWNER", "WAITER"],
  },
  {
    href: "/shifts",
    label: "Count",
    icon: Scale,
    roles: ["OWNER", "STOCK_CLERK", "CHEF"],
  },
  { href: "/wastage", label: "Waste", icon: Trash2 },
  { href: "/insights", label: "Area", icon: MapPinned, roles: ["OWNER"] },
];

export function AppShell({
  children,
  userName,
  restaurantName,
  role,
}: {
  children: React.ReactNode;
  userName: string;
  restaurantName: string;
  role: UserRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const root = navRef.current;
    if (!root) return;
    const frame = requestAnimationFrame(() => {
      const active = root.querySelector<HTMLElement>("[data-active='true']");
      if (!active) return;
      const left =
        active.getBoundingClientRect().left -
        root.getBoundingClientRect().left +
        root.scrollLeft -
        (root.clientWidth - active.offsetWidth) / 2;
      root.scrollTo({ left: Math.max(0, left) });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, role]);

  const links = allLinks.filter((l) => {
    if (l.roles && !l.roles.includes(role)) return false;
    if (!showLaunchExtras() && LAUNCH_EXTRA_HREFS.includes(l.href)) return false;
    return true;
  });
  const primaryLinks = links.filter((l) => !LAUNCH_EXTRA_HREFS.includes(l.href));
  const moreLinks = links.filter((l) => LAUNCH_EXTRA_HREFS.includes(l.href));
  const moreActive = moreLinks.some(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`),
  );

  function goTo(href: string, active: boolean, event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setMoreOpen(false);
    if (!active) router.push(href);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col overflow-x-clip pb-24">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <RestmanLogo size={26} />
            <p className="mt-1 truncate text-xs text-[var(--muted)]">
              {restaurantName} · {userName}
              <span className="ml-1 opacity-70">· {role.toLowerCase()}</span>
            </p>
            <a href="/support" className="text-xs font-medium text-[var(--accent)]">
              Report a problem
            </a>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur-md">
        {moreOpen && moreLinks.length > 0 && (
          <div className="mx-auto grid max-w-lg grid-cols-3 gap-1 border-b border-[var(--border)] px-2 py-2">
            {moreLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <a
                  key={`${href}-${label}`}
                  href={href}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px]",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--muted)]",
                  )}
                  onClick={(event) => goTo(href, active, event)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              );
            })}
          </div>
        )}
        <div
          ref={navRef}
          className="mx-auto flex max-w-lg justify-between gap-0.5 overflow-x-clip px-1 py-1.5"
        >
          {primaryLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <a
                key={`${href}-${label}`}
                href={href}
                data-active={active ? "true" : "false"}
                className={cn(
                  "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px]",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)]",
                )}
                onClick={(event) => goTo(href, active, event)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </a>
            );
          })}
          {moreLinks.length > 0 && (
            <button
              type="button"
              data-active={moreActive && !moreOpen ? "true" : "false"}
              className={cn(
                "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px]",
                moreOpen || moreActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)]",
              )}
              aria-expanded={moreOpen}
              aria-label="More pages"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Ellipsis className="h-4 w-4" />
              More
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
