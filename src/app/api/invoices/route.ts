import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invoiceFiles, invoiceLines, invoices, suppliers } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { matchLines, parseInvoiceText, type ParsedLine } from "@/lib/invoice-text";
import { activeLocation } from "@/lib/active-location";

const schema = z
  .object({
    supplierName: z.string().min(1).max(160),
    text: z.string().max(8000).optional(),
    imageBase64: z.string().max(6_000_000).optional(),
    mime: z.string().max(80).optional(),
  })
  .refine((value) => Boolean(value.text?.trim() || value.imageBase64), {
    message: "Paste invoice lines or attach a photo",
  });

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("Forbidden", 403);
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.restaurantId, session.restaurantId))
    .orderBy(desc(invoices.createdAt))
    .limit(20);
  const ids = rows.map((row) => row.id);
  const lines = ids.length
    ? await db
        .select()
        .from(invoiceLines)
        .where(inArray(invoiceLines.invoiceId, ids))
    : [];
  return jsonOk({ invoices: rows, lines });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Unauthorized", 401);
  if (!["OWNER", "CHEF", "STOCK_CLERK"].includes(session.role)) {
    return jsonError("You can't scan invoices", 403);
  }

  try {
    const body = schema.parse(await readJson(request));
    let parsedInput: ParsedLine[];
    if (body.imageBase64) {
      const { readInvoicePhoto } = await import("@/lib/gemini");
      const lines = await readInvoicePhoto(
        body.imageBase64,
        body.mime || "image/jpeg",
      );
      parsedInput = lines.map((line) => ({
        rawText: `${line.name} ${line.qty} ${line.unit} ${line.unitPrice}`,
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        unitPrice: line.unitPrice,
        confidence: line.confidence,
        ingredientId: null,
      }));
    } else {
      parsedInput = parseInvoiceText(body.text ?? "");
    }
    const parsed = await matchLines(session.restaurantId, parsedInput);
    if (!parsed.length) return jsonError("No lines found", 400);
    const location = await activeLocation(session.restaurantId);
    const supplierName = body.supplierName.trim();
    const [existingSupplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.restaurantId, session.restaurantId),
          eq(suppliers.name, supplierName),
        ),
      )
      .limit(1);
    const supplier =
      existingSupplier ??
      (
        await db
          .insert(suppliers)
          .values({ restaurantId: session.restaurantId, name: supplierName })
          .returning()
      )[0];
    const totalCents = Math.round(
      parsed.reduce((sum, line) => sum + line.qty * line.unitPrice * 100, 0),
    );
    const [invoice] = await db
      .insert(invoices)
      .values({
        restaurantId: session.restaurantId,
        locationId: location.id,
        supplierId: supplier.id,
        supplierName: body.supplierName.trim(),
        status: "draft",
        totalCents: String(totalCents),
      })
      .returning();
    if (body.imageBase64) {
      await db.insert(invoiceFiles).values({
        invoiceId: invoice.id,
        mime: body.mime || "image/jpeg",
        data: body.imageBase64,
      });
      await db
        .update(invoices)
        .set({ imageUrl: `/api/invoices/${invoice.id}/file` })
        .where(eq(invoices.id, invoice.id));
    }
    const stored = await db
      .insert(invoiceLines)
      .values(
        parsed.map((line) => ({
          invoiceId: invoice.id,
          rawText: line.rawText,
          ingredientId: line.ingredientId,
          qty: line.qty.toFixed(3),
          unitPriceCents: String(Math.round(line.unitPrice * 100)),
          confidence: Math.max(0, Math.min(line.confidence, 1)).toFixed(3),
        })),
      )
      .returning();
    return jsonOk({ invoice, lines: stored }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError(err.issues[0]?.message ?? "Invalid input");
    }
    console.error(err);
    return jsonError("Could not read that invoice", 500);
  }
}
