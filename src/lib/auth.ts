import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "@/lib/session-cookie";

export type UserRole = "OWNER" | "CHEF" | "WAITER" | "STOCK_CLERK";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  restaurantId: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

function cookieSecure() {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function cookieDomain(): string | undefined {
  const raw = process.env.COOKIE_DOMAIN?.trim();
  return raw || undefined;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function getUserByPhone(phone: string) {
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return user ?? null;
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    restaurantId: user.restaurantId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secretKey());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  const domain = cookieDomain();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
    ...(domain ? { domain } : {}),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const domain = cookieDomain();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.restaurantId !== "string") return null;

    // Prefer live DB role/name so Team role changes apply without re-login.
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        restaurantId: users.restaurantId,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || user.restaurantId !== payload.restaurantId) return null;

    return {
      id: user.id,
      email: user.email ?? String(payload.email ?? ""),
      name: user.name ?? String(payload.name ?? ""),
      role: user.role as SessionUser["role"],
      restaurantId: user.restaurantId,
    };
  } catch {
    return null;
  }
}

export async function requireSession(roles?: UserRole[]) {
  const session = await getSession();
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (roles && !roles.includes(session.role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export function homePathForRole(role: string) {
  if (role === "CHEF") return "/recipes";
  if (role === "WAITER") return "/orders";
  if (role === "STOCK_CLERK") return "/inventory";
  return "/dashboard";
}
