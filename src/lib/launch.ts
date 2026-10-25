/** Paid-launch extras stay on unless NEXT_PUBLIC_SHOW_LAUNCH_EXTRAS=0. */
export function showLaunchExtras() {
  return process.env.NEXT_PUBLIC_SHOW_LAUNCH_EXTRAS !== "0";
}

export const LAUNCH_EXTRA_HREFS = [
  "/integrations",
  "/invoices",
  "/purchasing",
  "/prep",
  "/schedule",
  "/safety",
  "/places",
];
