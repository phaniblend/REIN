import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { getSession } from "@/lib/auth";
import {
  cloverConnector,
  connectors,
  quickBooksAuthorizeUrl,
  quickBooksConfigured,
  squareConnector,
  storeCredentials,
  toastConnector,
} from "@/lib/connectors";
import { ensureLocation } from "@/lib/pos-sync";
import { signDemoBody } from "@/lib/token-box";

const providers = ["square", "clover", "toast", "quickbooks"] as const;
type Provider = (typeof providers)[number];

function isProvider(value: string): value is Provider {
  return (providers as readonly string[]).includes(value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const origin = new URL(request.url).origin;
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", origin));
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can connect an account" }, { status: 403 });
  }
  const { provider } = await context.params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const ready =
    provider === "quickbooks"
      ? quickBooksConfigured()
      : connectors[provider].configured();
  if (!ready) {
    return NextResponse.json(
      { error: `${provider} is not configured on this server` },
      { status: 409 },
    );
  }
  const state = `${session.restaurantId}.${signDemoBody(session.restaurantId)}`;
  const url =
    provider === "quickbooks"
      ? quickBooksAuthorizeUrl(state)
      : provider === "square"
        ? squareConnector.authorizeUrl(state)
        : provider === "clover"
          ? cloverConnector.authorizeUrl(state)
          : toastConnector.authorizeUrl(state);
  return NextResponse.redirect(url);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can connect an account" }, { status: 403 });
  }
  const { provider } = await context.params;
  if (!isProvider(provider) || provider === "quickbooks") {
    return NextResponse.json({ error: "Use the connect link" }, { status: 400 });
  }
  const body = (await request.json()) as { code?: string; merchantId?: string; realmId?: string };
  if (!body.code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  const creds = await connectors[provider].authorize(body.code);
  if (body.merchantId) creds.merchantId = body.merchantId;
  if (body.realmId) creds.realmId = body.realmId;
  const location = await ensureLocation(session.restaurantId);
  const [existing] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.restaurantId, session.restaurantId),
        eq(integrationConnections.provider, provider),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(integrationConnections)
      .set({
        status: "connected",
        encryptedTokens: storeCredentials(creds),
        lastError: null,
        lastSyncedAt: new Date(),
      })
      .where(eq(integrationConnections.id, existing.id));
    return NextResponse.json({ connectionId: existing.id });
  }
  const [created] = await db
    .insert(integrationConnections)
    .values({
      restaurantId: session.restaurantId,
      locationId: location.id,
      provider,
      status: "connected",
      encryptedTokens: storeCredentials(creds),
      scopes: "catalog.read orders.read",
      lastSyncedAt: new Date(),
    })
    .returning();
  return NextResponse.json({ connectionId: created.id }, { status: 201 });
}
