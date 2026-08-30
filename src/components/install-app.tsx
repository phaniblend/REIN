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

function detectIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

function detectChromeIos() {
  if (typeof navigator === "undefined") return false;
  return /CriOS/i.test(navigator.userAgent);
}

/**
 * Android: native install when browser fires beforeinstallprompt.
 * iPhone: Apple blocks install APIs — show Share → Add to Home Screen
 * (works in Safari; Chrome iOS also has it under ⋯ → Share).
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);
  const [chromeIos, setChromeIos] = useState(false);

  useEffect(() => {
    if (detectStandalone()) {
      setInstalled(true);
      return;
    }
    setIos(detectIos());
    setChromeIos(detectChromeIos());

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
        <p className="text-base font-semibold text-[var(--accent)]">
          {ios
            ? chromeIos
              ? "Add from Chrome (iPhone)"
              : "Add from Safari (iPhone)"
            : "Add to your phone"}
        </p>

        {ios && chromeIos ? (
          <>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Chrome on iPhone can’t show a one-tap install button (Apple
              limitation). Use Share inside Chrome — or open this page in Safari.
            </p>
            <ol className="mt-3 list-decimal space-y-2.5 pl-5">
              <li>
                Tap <strong>⋯</strong> (menu) at the bottom right
              </li>
              <li>
                Tap <strong>Share…</strong>
              </li>
              <li>
                Scroll and tap{" "}
                <PlusSquare
                  className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
                  aria-hidden
                />{" "}
                <strong>Add to Home Screen</strong>
              </li>
              <li>
                Tap <strong>Add</strong>
              </li>
            </ol>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {ios
                ? "Apple doesn’t allow one-tap install from the page. Use Safari’s Share sheet."
                : "On Android Chrome, use Install app above when it appears. On iPhone, use the steps below in Safari or Chrome."}
            </p>
            <ol className="mt-3 list-decimal space-y-2.5 pl-5">
              <li>
                Tap{" "}
                <Share
                  className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
                  aria-hidden
                />{" "}
                <strong>Share</strong> (Safari toolbar)
              </li>
              <li>
                <strong>Scroll down</strong> past AirDrop / apps until{" "}
                <PlusSquare
                  className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
                  aria-hidden
                />{" "}
                <strong>Add to Home Screen</strong>
              </li>
              <li>
                Missing? <strong>Edit Actions…</strong> → enable it → Done → tap
                it
              </li>
              <li>
                Tap <strong>Add</strong>
              </li>
            </ol>
          </>
        )}
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
