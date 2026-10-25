import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { getSession } from "@/lib/auth";
import {
  connectors,
  quickBooksConfigured,
  storeCredentials,
  syncConnection,
} from "@/lib/connectors";
import { ensureLocation } from "@/lib/pos-sync";
import { verifyDemoSignature } from "@/lib/token-box";

async function saveConnection(input: {
  restaurantId: string;
  provider: "square" | "clover" | "toast" | "quickbooks";
  tokenBlob: string;
}) {
  const location = await ensureLocation(input.restaurantId);
  const [existing] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.restaurantId, input.restaurantId),
        eq(integrationConnections.provider, input.provider),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(integrationConnections)
      .set({
        status: "connected",
        encryptedTokens: input.tokenBlob,
        lastError: null,
      })
      .where(eq(integrationConnections.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(integrationConnections)
    .values({
      restaurantId: input.restaurantId,
      locationId: location.id,
      provider: input.provider,
      status: "connected",
      encryptedTokens: input.tokenBlob,
      scopes: "catalog.read orders.read",
    })
    .returning();
  return created.id;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const origin = new URL(request.url).origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", origin));
  const { provider } = await context.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const [restaurantId, signature] = state.split(".");
  if (
    !code ||
    restaurantId !== session.restaurantId ||
    !verifyDemoSignature(restaurantId, signature)
  ) {
    return NextResponse.redirect(new URL("/integrations?error=oauth", origin));
  }

  try {
    if (provider === "quickbooks") {
      if (!quickBooksConfigured()) throw new Error("QuickBooks is not configured");
      const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.INTUIT_CLIENT_ID}:${process.env.INTUIT_CLIENT_SECRET}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.INTUIT_REDIRECT_URI ?? "",
        }),
      });
      if (!tokenRes.ok) throw new Error("QuickBooks did not accept that code");
      const token = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
      const connectionId = await saveConnection({
        restaurantId: session.restaurantId,
        provider: "quickbooks",
        tokenBlob: storeCredentials({
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          realmId: url.searchParams.get("realmId") ?? undefined,
        }),
      });
      return NextResponse.redirect(new URL(`/integrations?connected=${connectionId}`, origin));
    }
    if (provider !== "square" && provider !== "clover" && provider !== "toast") {
      return NextResponse.redirect(new URL("/integrations?error=oauth", origin));
    }
    const creds = await connectors[provider].authorize(code);
    const merchantId = url.searchParams.get("merchant_id") ?? url.searchParams.get("merchantId");
    if (merchantId) creds.merchantId = merchantId;
    const connectionId = await saveConnection({
      restaurantId: session.restaurantId,
      provider,
      tokenBlob: storeCredentials(creds),
    });
    await syncConnection(connectionId);
    return NextResponse.redirect(new URL("/integrations?connected=1", origin));
  } catch {
    return NextResponse.redirect(new URL("/integrations?error=oauth", origin));
  }
}
