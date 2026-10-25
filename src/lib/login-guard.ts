import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAttempts } from "@/db/schema";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function assertLoginAllowed(key: string) {
  const [row] = await db
    .select()
    .from(authAttempts)
    .where(eq(authAttempts.key, key))
    .limit(1);
  if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    return {
      ok: false as const,
      error: "Too many attempts. Try again in 15 minutes.",
      status: 429,
    };
  }
  return { ok: true as const };
}

export async function recordLoginFailure(key: string) {
  const [row] = await db
    .select()
    .from(authAttempts)
    .where(eq(authAttempts.key, key))
    .limit(1);
  const failures = Number(row?.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS) : null;
  if (row) {
    await db
      .update(authAttempts)
      .set({ failures: String(failures), lockedUntil, updatedAt: new Date() })
      .where(eq(authAttempts.key, key));
  } else {
    await db.insert(authAttempts).values({
      key,
      failures: String(failures),
      lockedUntil,
    });
  }
}

export async function clearLoginFailures(key: string) {
  await db.delete(authAttempts).where(eq(authAttempts.key, key));
}
