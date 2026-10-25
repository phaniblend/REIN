import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { findTestLogin } from "@/lib/test-login-accounts";
import { ensureTestLogins } from "@/lib/test-logins";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/login-guard";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    const email = body.email.toLowerCase();
    if (findTestLogin(email)) {
      await ensureTestLogins();
    }
    const gate = await assertLoginAllowed(email);
    if (!gate.ok) return jsonError(gate.error, gate.status);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user?.passwordHash) {
      await recordLoginFailure(email);
      return jsonError("Invalid credentials", 401);
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      await recordLoginFailure(email);
      return jsonError("Invalid credentials", 401);
    }
    await clearLoginFailures(email);

    const token = await createSessionToken({
      id: user.id,
      email: user.email ?? "",
      name: user.name,
      role: user.role,
      restaurantId: user.restaurantId,
    });
    await setSessionCookie(token);

    return jsonOk({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Login failed", 500);
  }
}
