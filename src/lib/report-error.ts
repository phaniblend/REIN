/** Forwards a server error when SENTRY_DSN is set. Never throws. */
export async function reportError(error: unknown) {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    const message = error instanceof Error ? error.message : String(error);
    await fetch(`${url.protocol}//${url.host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${url.username}, sentry_client=restman/1`,
      },
      body: JSON.stringify({
        message,
        level: "error",
        platform: "javascript",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Reporting must not take down the request.
  }
}
