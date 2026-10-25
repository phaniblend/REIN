import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoiceFiles, invoices } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.restaurantId, session.restaurantId)))
    .limit(1);
  if (!invoice) return jsonError("Invoice not found", 404);
  const [file] = await db
    .select()
    .from(invoiceFiles)
    .where(eq(invoiceFiles.invoiceId, invoice.id))
    .limit(1);
  if (!file) return jsonError("No photo stored", 404);
  const bytes = Buffer.from(file.data, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-store",
    },
  });
}
