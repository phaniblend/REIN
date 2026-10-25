import { z } from "zod";
import { db } from "@/db";
import { supportMessages, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { sendEmail } from "@/lib/email";

const schema = z.object({
  message: z.string().min(8).max(2000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  try {
    const body = schema.parse(await readJson(request));
    const [row] = await db
      .insert(supportMessages)
      .values({
        restaurantId: session.restaurantId,
        userId: session.id,
        message: body.message.trim(),
      })
      .returning();
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);
    const to = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;
    if (to) {
      await sendEmail(
        to,
        `Restman help from ${user?.name ?? session.name}`,
        `${body.message.trim()}\n\nFrom ${user?.email ?? session.id}`,
      );
    }
    return jsonOk({ id: row.id });
  } catch (err) {
    if (err instanceof z.ZodError) return jsonError(err.issues[0]?.message ?? "Invalid input");
    console.error(err);
    return jsonError("Could not send that note", 500);
  }
}
