"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share } from "lucide-react";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

/**
 * Always show iPhone steps — Apple has no install API, and UA detection is flaky.
 * Android still gets the native prompt when available.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (detectStandalone()) {
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
      <p className="rounded-2xl bg-[var(--tan)] px-4 py-3 text-center text-sm text-[var(--accent)]">
        Restman is on your Home Screen — open it from there next time.
      </p>
    );
  }

  async function onInstallClick() {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {deferred ? (
        <button
          type="button"
          onClick={onInstallClick}
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-base font-medium text-[var(--accent-fg)] active:opacity-90"
        >
          <Download className="h-4 w-4" aria-hidden />
          {busy ? "Installing…" : "Install app"}
        </button>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--tan)] px-4 py-4 text-sm text-[var(--fg)]">
        <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--accent)]">
          iPhone: add Restman to Home Screen
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Must use <strong>Safari</strong>. Chrome / Instagram in-app browsers
          won’t show this option.
        </p>
        <ol className="mt-3 list-decimal space-y-2.5 pl-5">
          <li>
            Tap the{" "}
            <Share
              className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
              aria-hidden
            />{" "}
            <strong>Share</strong> button (square with ↑) in Safari’s toolbar
          </li>
          <li>
            <strong>Scroll down</strong> the share sheet — past AirDrop / apps —
            until you see{" "}
            <PlusSquare
              className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
              aria-hidden
            />{" "}
            <strong>Add to Home Screen</strong>
          </li>
          <li>
            If it’s missing: tap <strong>Edit Actions…</strong> → enable{" "}
            <strong>Add to Home Screen</strong> → Done, then tap it
          </li>
          <li>
            Tap <strong>Add</strong> in the top right
          </li>
        </ol>
      </div>
    </div>
  );
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
