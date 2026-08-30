"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function InstallAppButton({
  className,
  variant = "primary",
}: {
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="text-center text-sm text-[var(--muted)]">
        Restman is installed on this device.
      </p>
    );
  }

  async function install() {
    if (deferred) {
      setBusy(true);
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setBusy(false);
      return;
    }
    if (isIos()) {
      setIosHint(true);
      return;
    }
    // Browser supports PWA but prompt not ready yet — nudge user
    setIosHint(true);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={install}
        disabled={busy}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-medium",
          variant === "primary"
            ? "bg-[var(--accent)] text-[var(--accent-fg)]"
            : "border border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]",
        )}
      >
        <Download className="h-4 w-4" />
        {busy ? "Installing…" : "Install app"}
      </button>
      {iosHint && (
        <p className="text-center text-xs text-[var(--muted)]">
          {isIos()
            ? "On iPhone: tap Share, then “Add to Home Screen”."
            : deferred
              ? null
              : "Open this site in Chrome/Edge on your phone, then tap Install app again — or use the browser’s Install / Add to Home Screen menu."}
        </p>
      )}
    </div>
  );
}

/** Registers the service worker once on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore — install still works when SW eventually registers */
    });
  }, []);
  return null;
}
