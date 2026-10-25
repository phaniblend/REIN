import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections, syncJobs } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/token-box";
import { ingestSale } from "@/lib/pos-sync";

export type Credentials = {
  accessToken: string;
  refreshToken?: string;
  merchantId?: string;
  realmId?: string;
  expiresAt?: string;
};

export type CatalogItem = {
  externalId: string;
  name: string;
  variation?: string;
  priceCents: number;
};

export type SaleLine = {
  externalLineId: string;
  externalItemId: string;
  itemName: string;
  qty: number;
  netCents: number;
  soldAt: string;
  channel?: string;
};

export type PosConnector = {
  provider: "square" | "clover" | "toast";
  configured: () => boolean;
  authorizeUrl: (state: string) => string;
  authorize: (code: string) => Promise<Credentials>;
  refresh: (creds: Credentials) => Promise<Credentials>;
  listCatalog: (creds: Credentials) => Promise<CatalogItem[]>;
  listOrders: (creds: Credentials, since: Date) => Promise<SaleLine[]>;
};

function squareHost() {
  return process.env.SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function appOrigin() {
  return (process.env.APP_URL || "https://www.restman.live").replace(/\/$/, "");
}

export const squareConnector: PosConnector = {
  provider: "square",
  configured: () =>
    Boolean(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET),
  authorizeUrl: (state) => {
    const params = new URLSearchParams({
      client_id: process.env.SQUARE_APPLICATION_ID ?? "",
      scope: "ITEMS_READ ORDERS_READ MERCHANT_PROFILE_READ",
      session: "false",
      state,
      redirect_uri: `${appOrigin()}/api/integrations/oauth/square/callback`,
    });
    return `${squareHost()}/oauth2/authorize?${params}`;
  },
  async authorize(code) {
    const res = await fetch(`${squareHost()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appOrigin()}/api/integrations/oauth/square/callback`,
      }),
    });
    if (!res.ok) throw new Error("Square did not accept that code");
    const body = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      merchant_id?: string;
      expires_at?: string;
    };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      merchantId: body.merchant_id,
      expiresAt: body.expires_at,
    };
  },
  async refresh(creds) {
    const res = await fetch(`${squareHost()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      }),
    });
    if (!res.ok) throw new Error("Square token refresh failed");
    const body = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_at?: string;
    };
    return {
      ...creds,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? creds.refreshToken,
      expiresAt: body.expires_at,
    };
  },
  async listCatalog(creds) {
    const res = await fetch(`${squareHost()}/v2/catalog/list?types=ITEM`, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Square-Version": "2024-10-17",
      },
    });
    if (!res.ok) throw new Error("Square catalog request failed");
    const body = (await res.json()) as {
      objects?: {
        id: string;
        item_data?: {
          name?: string;
          variations?: {
            id: string;
            item_variation_data?: {
              name?: string;
              price_money?: { amount?: number };
            };
          }[];
        };
      }[];
    };
    const items: CatalogItem[] = [];
    for (const object of body.objects ?? []) {
      const variations = object.item_data?.variations ?? [];
      if (!variations.length) {
        items.push({
          externalId: object.id,
          name: object.item_data?.name ?? "Item",
          priceCents: 0,
        });
        continue;
      }
      for (const variation of variations) {
        items.push({
          externalId: variation.id,
          name: object.item_data?.name ?? "Item",
          variation: variation.item_variation_data?.name,
          priceCents: variation.item_variation_data?.price_money?.amount ?? 0,
        });
      }
    }
    return items;
  },
  async listOrders(creds, since) {
    if (!creds.merchantId) return [];
    const locations = await fetch(`${squareHost()}/v2/locations`, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Square-Version": "2024-10-17",
      },
    });
    if (!locations.ok) throw new Error("Square locations request failed");
    const locBody = (await locations.json()) as {
      locations?: { id: string }[];
    };
    const locationIds = (locBody.locations ?? []).map((row) => row.id);
    if (!locationIds.length) return [];
    const res = await fetch(`${squareHost()}/v2/orders/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Square-Version": "2024-10-17",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        location_ids: locationIds,
        query: {
          filter: { date_time_filter: { created_at: { start_at: since.toISOString() } } },
        },
      }),
    });
    if (!res.ok) throw new Error("Square orders request failed");
    const body = (await res.json()) as {
      orders?: {
        id: string;
        line_items?: {
          uid?: string;
          catalog_object_id?: string;
          name?: string;
          quantity?: string;
          gross_sales_money?: { amount?: number };
        }[];
        created_at?: string;
      }[];
    };
    const lines: SaleLine[] = [];
    for (const order of body.orders ?? []) {
      for (const line of order.line_items ?? []) {
        lines.push({
          externalLineId: `${order.id}:${line.uid ?? line.catalog_object_id ?? line.name}`,
          externalItemId: line.catalog_object_id ?? line.name ?? "unknown",
          itemName: line.name ?? "Item",
          qty: Number(line.quantity ?? 1),
          netCents: line.gross_sales_money?.amount ?? 0,
          soldAt: order.created_at ?? new Date().toISOString(),
          channel: "in_house",
        });
      }
    }
    return lines;
  },
};

export const cloverConnector: PosConnector = {
  provider: "clover",
  configured: () => Boolean(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET),
  authorizeUrl: (state) => {
    const params = new URLSearchParams({
      client_id: process.env.CLOVER_APP_ID ?? "",
      response_type: "code",
      state,
    });
    const host =
      process.env.CLOVER_ENV === "sandbox"
        ? "https://sandbox.dev.clover.com"
        : "https://www.clover.com";
    return `${host}/oauth/v2/authorize?${params}`;
  },
  async authorize(code) {
    const host =
      process.env.CLOVER_ENV === "sandbox"
        ? "https://apisandbox.dev.clover.com"
        : "https://api.clover.com";
    const res = await fetch(`${host}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.CLOVER_APP_ID,
        client_secret: process.env.CLOVER_APP_SECRET,
        code,
      }),
    });
    if (!res.ok) throw new Error("Clover did not accept that code");
    const body = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    return { accessToken: body.access_token, refreshToken: body.refresh_token };
  },
  async refresh(creds) {
    return creds;
  },
  async listCatalog(creds) {
    if (!creds.merchantId) return [];
    const host =
      process.env.CLOVER_ENV === "sandbox"
        ? "https://apisandbox.dev.clover.com"
        : "https://api.clover.com";
    const res = await fetch(`${host}/v3/merchants/${creds.merchantId}/items`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!res.ok) throw new Error("Clover catalog request failed");
    const body = (await res.json()) as {
      elements?: { id: string; name: string; price?: number }[];
    };
    return (body.elements ?? []).map((item) => ({
      externalId: item.id,
      name: item.name,
      priceCents: item.price ?? 0,
    }));
  },
  async listOrders(creds, since) {
    if (!creds.merchantId) return [];
    const host =
      process.env.CLOVER_ENV === "sandbox"
        ? "https://apisandbox.dev.clover.com"
        : "https://api.clover.com";
    const res = await fetch(
      `${host}/v3/merchants/${creds.merchantId}/orders?filter=createdTime>=${since.getTime()}&expand=lineItems`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } },
    );
    if (!res.ok) throw new Error("Clover orders request failed");
    const body = (await res.json()) as {
      elements?: {
        id: string;
        createdTime?: number;
        lineItems?: { elements?: { id: string; name?: string; price?: number }[] };
      }[];
    };
    const lines: SaleLine[] = [];
    for (const order of body.elements ?? []) {
      for (const line of order.lineItems?.elements ?? []) {
        lines.push({
          externalLineId: `${order.id}:${line.id}`,
          externalItemId: line.id,
          itemName: line.name ?? "Item",
          qty: 1,
          netCents: line.price ?? 0,
          soldAt: new Date(order.createdTime ?? Date.now()).toISOString(),
        });
      }
    }
    return lines;
  },
};

export const toastConnector: PosConnector = {
  provider: "toast",
  configured: () =>
    Boolean(process.env.TOAST_CLIENT_ID && process.env.TOAST_CLIENT_SECRET),
  authorizeUrl: (state) => {
    const params = new URLSearchParams({
      client_id: process.env.TOAST_CLIENT_ID ?? "",
      response_type: "code",
      state,
    });
    return `https://ws-api.toasttab.com/authentication/v1/authentication/login?${params}`;
  },
  async authorize(code) {
    const res = await fetch(
      "https://ws-api.toasttab.com/authentication/v1/authentication/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: process.env.TOAST_CLIENT_ID,
          clientSecret: process.env.TOAST_CLIENT_SECRET,
          userAccessType: "TOAST_MACHINE_CLIENT",
          code,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        "Toast did not accept the login. Partner approval may still be pending.",
      );
    }
    const body = (await res.json()) as { token?: { accessToken?: string } };
    if (!body.token?.accessToken) throw new Error("Toast returned no token");
    return { accessToken: body.token.accessToken };
  },
  async refresh(creds) {
    return this.authorize("");
  },
  async listCatalog() {
    return [];
  },
  async listOrders(creds, since) {
    const guid = process.env.TOAST_RESTAURANT_GUID;
    if (!guid) return [];
    const start = since.toISOString();
    const end = new Date().toISOString();
    const res = await fetch(
      `https://ws-api.toasttab.com/orders/v2/ordersBulk?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Toast-Restaurant-External-ID": guid,
        },
      },
    );
    if (!res.ok) throw new Error("Toast orders request failed");
    const body = (await res.json()) as {
      guid?: string;
      createdDate?: string;
      checks?: {
        selections?: {
          guid?: string;
          displayName?: string;
          quantity?: number;
          price?: number;
        }[];
      }[];
    }[];
    const lines: SaleLine[] = [];
    for (const order of body ?? []) {
      for (const check of order.checks ?? []) {
        for (const selection of check.selections ?? []) {
          lines.push({
            externalLineId: `${order.guid}:${selection.guid}`,
            externalItemId: selection.guid ?? selection.displayName ?? "item",
            itemName: selection.displayName ?? "Item",
            qty: selection.quantity ?? 1,
            netCents: Math.round((selection.price ?? 0) * 100),
            soldAt: order.createdDate ?? new Date().toISOString(),
          });
        }
      }
    }
    return lines;
  },
};

export const connectors = {
  square: squareConnector,
  clover: cloverConnector,
  toast: toastConnector,
};

export function quickBooksConfigured() {
  return Boolean(process.env.INTUIT_CLIENT_ID && process.env.INTUIT_CLIENT_SECRET);
}

export function quickBooksAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.INTUIT_CLIENT_ID ?? "",
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: process.env.INTUIT_REDIRECT_URI ?? "",
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params}`;
}

export async function pushQuickBooksBill(
  creds: Credentials & { realmId?: string },
  bill: { supplierName: string; totalCents: number; invoiceId: string },
) {
  if (!creds.realmId) throw new Error("QuickBooks company is not selected");
  const res = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${creds.realmId}/bill`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        VendorRef: { name: bill.supplierName },
        Line: [
          {
            Amount: bill.totalCents / 100,
            DetailType: "AccountBasedExpenseLineDetail",
            Description: `Restman invoice ${bill.invoiceId}`,
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error("QuickBooks rejected the bill");
  const body = (await res.json()) as { Bill?: { Id?: string } };
  return body.Bill?.Id ?? null;
}

export async function pushQuickBooksJournal(
  creds: Credentials & { realmId?: string },
  entry: { amount: number; note: string },
) {
  if (!creds.realmId) throw new Error("QuickBooks company is not selected");
  const res = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${creds.realmId}/journalentry`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        PrivateNote: entry.note,
        Line: [
          {
            Amount: entry.amount,
            DetailType: "JournalEntryLineDetail",
            Description: entry.note,
            JournalEntryLineDetail: {
              PostingType: "Debit",
              AccountRef: { name: "Cost of Goods Sold" },
            },
          },
          {
            Amount: entry.amount,
            DetailType: "JournalEntryLineDetail",
            Description: entry.note,
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: { name: "Inventory Asset" },
            },
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error("QuickBooks rejected the journal entry");
  const body = (await res.json()) as { JournalEntry?: { Id?: string } };
  return body.JournalEntry?.Id ?? null;
}

export async function loadCredentials(blob: string | null): Promise<Credentials | null> {
  if (!blob) return null;
  try {
    return JSON.parse(decryptToken(blob)) as Credentials;
  } catch {
    return null;
  }
}

export function storeCredentials(creds: Credentials) {
  return encryptToken(JSON.stringify(creds));
}

/** Pulls catalog and orders since the last sync, or the last 30 days on first run. */
export async function syncConnection(connectionId: string) {
  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, connectionId))
    .limit(1);
  if (!connection || connection.status !== "connected") return;
  if (connection.provider === "demo" || connection.provider === "deliverect") {
    await db
      .update(integrationConnections)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(integrationConnections.id, connection.id));
    await db.insert(syncJobs).values({
      connectionId: connection.id,
      kind: "sync",
      status: "done",
      attempts: "1",
      finishedAt: new Date(),
    });
    return;
  }
  const connector = connectors[connection.provider as "square" | "clover" | "toast"];
  if (!connector) return;
  const [job] = await db
    .insert(syncJobs)
    .values({ connectionId: connection.id, kind: "sync", status: "pending", attempts: "1" })
    .returning();
  try {
    const creds = await loadCredentials(connection.encryptedTokens);
    if (!creds) throw new Error("Reconnect this register");
    const since = connection.lastSyncedAt
      ? connection.lastSyncedAt
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const catalog = await connector.listCatalog(creds);
    const { posItems } = await import("@/db/schema");
    for (const item of catalog) {
      const [existing] = await db
        .select()
        .from(posItems)
        .where(
          and(eq(posItems.connectionId, connection.id), eq(posItems.externalId, item.externalId)),
        )
        .limit(1);
      if (!existing) {
        await db.insert(posItems).values({
          connectionId: connection.id,
          externalId: item.externalId,
          name: item.variation ? `${item.name} · ${item.variation}` : item.name,
          variation: item.variation,
          priceCents: String(item.priceCents),
        });
      }
    }
    const sales = await connector.listOrders(creds, since);
    for (const sale of sales) {
      await ingestSale({
        connectionId: connection.id,
        externalLineId: sale.externalLineId,
        externalItemId: sale.externalItemId,
        itemName: sale.itemName,
        qty: sale.qty,
        netCents: sale.netCents,
        soldAt: new Date(sale.soldAt),
        channel: sale.channel,
      });
    }
    const { autoMapConnection } = await import("@/lib/pos-sync");
    await autoMapConnection(connection.id, connection.restaurantId);
    await db
      .update(integrationConnections)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(integrationConnections.id, connection.id));
    await db
      .update(syncJobs)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(syncJobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db
      .update(integrationConnections)
      .set({ lastError: message, status: "error" })
      .where(eq(integrationConnections.id, connection.id));
    await db
      .update(syncJobs)
      .set({ status: "error", lastError: message, finishedAt: new Date() })
      .where(eq(syncJobs.id, job.id));
  }
}

export async function syncStaleConnections(restaurantId: string) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const due = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.restaurantId, restaurantId),
        eq(integrationConnections.status, "connected"),
        lt(integrationConnections.lastSyncedAt, cutoff),
      ),
    );
  for (const row of due) {
    await syncConnection(row.id);
  }
}
