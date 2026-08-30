"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share } from "lucide-react";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+ can report as Mac
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function detectStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    if (detectStandalone()) {
      setInstalled(true);
      return;
    }
    setIsIos(detectIos());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setShowHowTo(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!ready) {
    return (
      <div
        className={cn(
          "h-12 w-full animate-pulse rounded-full bg-[var(--accent-soft)]",
          className,
        )}
      />
    );
  }

  if (installed) {
    return (
      <p className="rounded-2xl bg-[var(--tan)] px-4 py-3 text-center text-sm text-[var(--accent)]">
        Restman is on your Home Screen — open it from there next time.
      </p>
    );
  }

  async function onInstallClick() {
    // Android / desktop Chromium
    if (deferred) {
      setBusy(true);
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } finally {
        setDeferred(null);
        setBusy(false);
      }
      return;
    }

    // iPhone / iPad — Apple does not allow a native install API
    setShowHowTo(true);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={onInstallClick}
        disabled={busy}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-base font-medium text-[var(--accent-fg)] active:opacity-90"
      >
        <Download className="h-4 w-4" aria-hidden />
        {busy
          ? "Installing…"
          : isIos
            ? "Add to Home Screen"
            : deferred
              ? "Install app"
              : "Install app"}
      </button>

      {(showHowTo || isIos) && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--tan)] px-4 py-3 text-sm text-[var(--fg)]">
          {isIos ? (
            <>
              <p className="font-medium text-[var(--accent)]">
                iPhone / iPad — Safari only
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-[var(--fg)]">
                <li className="flex flex-wrap items-center gap-1">
                  Tap <Share className="inline h-4 w-4 text-[var(--accent)]" aria-hidden />{" "}
                  <strong>Share</strong> at the bottom of Safari
                </li>
                <li className="flex flex-wrap items-center gap-1">
                  Scroll and tap{" "}
                  <PlusSquare className="inline h-4 w-4 text-[var(--accent)]" aria-hidden />{" "}
                  <strong>Add to Home Screen</strong>
                </li>
                <li>
                  Tap <strong>Add</strong> — Restman appears like an app
                </li>
              </ol>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Apple doesn’t allow one-tap install from the page. If you don’t
                see Share, open this site in Safari (not Chrome/Instagram).
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-[var(--accent)]">Install from your browser</p>
              <p className="mt-1 text-[var(--muted)]">
                Use the browser menu → <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>. On Android Chrome the
                install banner may also appear at the top.
              </p>
            </>
          )}
          {showHowTo && !isIos && (
            <button
              type="button"
              className="mt-2 text-xs text-[var(--accent)] underline"
              onClick={() => setShowHowTo(false)}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Registers the service worker once on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
