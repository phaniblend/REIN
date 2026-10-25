export async function onRequestError(error: unknown) {
  const { reportError } = await import("@/lib/report-error");
  await reportError(error);
}
