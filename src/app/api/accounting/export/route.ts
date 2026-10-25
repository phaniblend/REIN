import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accountingExports, integrationConnections, invoices } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { loadCredentials, pushQuickBooksBill } from "@/lib/connectors";
import { num } from "@/lib/utils";

const schema = z.object({ invoiceId: z.string().uuid() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (session.role !== "OWNER") {
    return jsonError("Only the owner can export to accounting", 403);
  }
  const body = schema.parse(await readJson(request));
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, body.invoiceId), eq(invoices.restaurantId, session.restaurantId)),
    )
    .limit(1);
  if (!invoice) return jsonError("Invoice not found", 404);
  if (invoice.status !== "confirmed") {
    return jsonError("Confirm the invoice before exporting it", 400);
  }
  const payload = {
    supplierName: invoice.supplierName,
    totalCents: num(invoice.totalCents),
    invoiceId: invoice.id,
  };
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.restaurantId, session.restaurantId),
        eq(integrationConnections.provider, "quickbooks"),
        eq(integrationConnections.status, "connected"),
      ),
    )
    .limit(1);
  let status = "queued";
  let externalId: string | null = null;
  if (connection) {
    const creds = await loadCredentials(connection.encryptedTokens);
    if (creds?.realmId) {
      externalId = await pushQuickBooksBill(creds, payload);
      status = "sent";
    }
  }
  const [row] = await db
    .insert(accountingExports)
    .values({
      restaurantId: session.restaurantId,
      invoiceId: invoice.id,
      provider: "quickbooks",
      status,
      payload: JSON.stringify(payload),
      externalId,
    })
    .returning();
  return jsonOk({ export: row });
}
