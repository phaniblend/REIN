import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { createAndSendOtp } from "@/lib/otp";
import { maskPhone, normalizePhone } from "@/lib/phone";

const bodySchema = z.object({
  phone: z.string().min(8),
  purpose: z.enum(["login", "register"]),
  restaurantName: z.string().min(2).optional(),
  cuisineType: z.string().min(2).optional(),
  city: z.string().min(2).optional(),
  region: z.string().optional(),
  country: z.string().min(2).optional(),
  currency: z.string().min(3).max(3).optional(),
  ownerName: z.string().min(2).optional(),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    const phone = normalizePhone(body.phone);
    if (!phone) {
      return jsonError("Enter a valid mobile number (include country code)");
    }

    if (body.purpose === "login") {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);
      if (!user) {
        return jsonError("No account for that mobile number", 404);
      }

      const sent = await createAndSendOtp({ phone, purpose: "login" });
      if (!sent.ok) return jsonError(sent.error, sent.status);

      return jsonOk({
        ok: true,
        phoneMasked: maskPhone(phone),
        expiresInSec: sent.expiresInSec,
        provider: sent.provider,
        ...(sent.devCode ? { devCode: sent.devCode } : {}),
      });
    }

    if (
      !body.restaurantName ||
      !body.cuisineType ||
      !body.city ||
      !body.ownerName
    ) {
      return jsonError("Restaurant details are required to register");
    }

    const [existingPhone] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (existingPhone) {
      return jsonError("That mobile is already registered — sign in instead", 409);
    }

    if (body.email) {
      const [existingEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email.toLowerCase()))
        .limit(1);
      if (existingEmail) return jsonError("Email already registered", 409);
    }

    const sent = await createAndSendOtp({
      phone,
      purpose: "register",
      payload: {
        restaurantName: body.restaurantName,
        cuisineType: body.cuisineType,
        city: body.city,
        region: body.region ?? "",
        country: body.country ?? "US",
        currency: body.currency ?? "USD",
        ownerName: body.ownerName,
        email: body.email?.toLowerCase() ?? null,
      },
    });
    if (!sent.ok) return jsonError(sent.error, sent.status);

    return jsonOk({
      ok: true,
      phoneMasked: maskPhone(phone),
      expiresInSec: sent.expiresInSec,
      provider: sent.provider,
      ...(sent.devCode ? { devCode: sent.devCode } : {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Could not send code", 500);
  }
}
