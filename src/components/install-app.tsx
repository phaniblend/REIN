"use client";

import { useEffect, useState } from "react";
import { Copy, Download, PlusSquare, Share, X } from "lucide-react";
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

/** Chrome / Edge / Firefox on iOS — no native install API */
function detectNonSafariIos() {
  if (typeof navigator === "undefined") return false;
  if (!detectIos()) return false;
  return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(navigator.userAgent);
}

function SafariSteps() {
  return (
    <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm text-[var(--fg)]">
      <li>
        Open this site in <strong>Safari</strong>
      </li>
      <li>
        Tap{" "}
        <Share
          className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
          aria-hidden
        />{" "}
        <strong>Share</strong> (square with ↑)
      </li>
      <li>
        Scroll down and tap{" "}
        <PlusSquare
          className="mx-0.5 inline h-4 w-4 align-text-bottom text-[var(--accent)]"
          aria-hidden
        />{" "}
        <strong>Add to Home Screen</strong>
      </li>
      <li>
        Missing? <strong>Edit Actions…</strong> → enable it → Done → tap it
      </li>
      <li>
        Tap <strong>Add</strong>
      </li>
    </ol>
  );
}

export function InstallAppButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);
  const [nonSafariIos, setNonSafariIos] = useState(false);
  const [showSafariModal, setShowSafariModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (detectStandalone()) {
      setInstalled(true);
      return;
    }
    setIos(detectIos());
    setNonSafariIos(detectNonSafariIos());

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

    // Chrome (and other browsers) on iPhone — guide to Safari
    setShowSafariModal(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const buttonLabel = deferred
    ? busy
      ? "Installing…"
      : "Install app"
    : nonSafariIos || ios
      ? "Install app"
      : "Install app";

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={onInstallClick}
        disabled={busy}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-base font-medium text-[var(--accent-fg)] active:opacity-90"
      >
        <Download className="h-4 w-4" aria-hidden />
        {buttonLabel}
      </button>

      {ios && !nonSafariIos && !showSafariModal ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--tan)] px-4 py-4">
          <p className="text-base font-semibold text-[var(--accent)]">
            Safari: Add to Home Screen
          </p>
          <SafariSteps />
        </div>
      ) : null}

      {showSafariModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="safari-install-title"
          onClick={() => setShowSafariModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="safari-install-title"
                  className="text-lg font-semibold text-[var(--accent)]"
                >
                  Please use Safari
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {nonSafariIos
                    ? "Chrome on iPhone can’t install apps the Android way. Open Restman in Safari, then follow these steps:"
                    : "On iPhone, install works through Safari’s Share menu:"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--tan)]"
                aria-label="Close"
                onClick={() => setShowSafariModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <SafariSteps />

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--fg)] bg-[var(--surface)] text-sm font-medium"
              >
                <Copy className="h-4 w-4" aria-hidden />
                {copied ? "Link copied" : "Copy link to open in Safari"}
              </button>
              <button
                type="button"
                onClick={() => setShowSafariModal(false)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
