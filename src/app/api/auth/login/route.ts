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

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    if (findTestLogin(body.email)) {
      await ensureTestLogins();
    }
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (!user?.passwordHash) return jsonError("Invalid credentials", 401);
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return jsonError("Invalid credentials", 401);

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
