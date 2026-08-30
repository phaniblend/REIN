import { createHash, randomInt } from "crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { otpChallenges } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendSms } from "@/lib/sms";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_ATTEMPTS = 5;

export function generateOtpCode() {
  return String(randomInt(100000, 999999));
}

export async function createAndSendOtp(opts: {
  phone: string;
  purpose: "login" | "register";
  payload?: unknown;
}) {
  const recent = await db
    .select()
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, opts.phone))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  const last = recent[0];
  if (
    last &&
    Date.now() - new Date(last.createdAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    return {
      ok: false as const,
      error: "Wait a moment before requesting another code",
      status: 429,
    };
  }

  const code = generateOtpCode();
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db.insert(otpChallenges).values({
    phone: opts.phone,
    codeHash,
    purpose: opts.purpose,
    payload: opts.payload ? JSON.stringify(opts.payload) : null,
    expiresAt,
  });

  const sms = await sendSms(
    opts.phone,
    `Your Restman code is ${code}. It expires in 10 minutes.`,
  );

  if (!sms.ok) {
    return {
      ok: false as const,
      error: sms.error ?? "Could not send SMS",
      status: 502,
    };
  }

  return {
    ok: true as const,
    provider: sms.provider,
    devCode: sms.provider === "console" ? code : undefined,
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
  };
}

export async function consumeOtp(opts: {
  phone: string;
  code: string;
  purpose: "login" | "register";
}) {
  const now = new Date();
  const rows = await db
    .select()
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.phone, opts.phone),
        eq(otpChallenges.purpose, opts.purpose),
        gt(otpChallenges.expiresAt, now),
      ),
    )
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);

  const challenge = rows[0];
  if (!challenge) {
    return { ok: false as const, error: "Code expired or not found", status: 400 };
  }

  const attempts = Number(challenge.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    return {
      ok: false as const,
      error: "Too many attempts — request a new code",
      status: 429,
    };
  }

  const valid = await verifyPassword(opts.code.trim(), challenge.codeHash);
  if (!valid) {
    await db
      .update(otpChallenges)
      .set({ attempts: String(attempts + 1) })
      .where(eq(otpChallenges.id, challenge.id));
    return { ok: false as const, error: "Invalid code", status: 401 };
  }

  await db.delete(otpChallenges).where(eq(otpChallenges.id, challenge.id));

  let payload: unknown = null;
  if (challenge.payload) {
    try {
      payload = JSON.parse(challenge.payload);
    } catch {
      payload = null;
    }
  }

  return { ok: true as const, payload };
}

export function phoneFingerprint(phone: string) {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
}
