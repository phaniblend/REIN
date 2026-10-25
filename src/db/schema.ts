import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("user_role", [
  "OWNER",
  "CHEF",
  "WAITER",
  "STOCK_CLERK",
]);
export const unitEnum = pgEnum("unit_type", [
  "KG",
  "G",
  "L",
  "ML",
  "PIECE",
  "PACKET",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
]);
export const orderSourceEnum = pgEnum("order_source", [
  "restman",
  "restaurant_pos",
]);
export const integrationProviderEnum = pgEnum("integration_provider", [
  "demo",
  "square",
  "clover",
  "toast",
  "quickbooks",
  "xero",
  "deliverect",
  "shifts",
]);
export const connectionStatusEnum = pgEnum("connection_status", [
  "connected",
  "error",
  "disconnected",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "confirmed",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PREPARING",
  "SERVED",
  "RETURNED",
  "CANCELLED",
]);
export const returnReasonEnum = pgEnum("return_reason", [
  "CUSTOMER_TASTE",
  "DEFECT_BURNT",
  "DEFECT_COLD",
  "DEFECT_FOREIGN_OBJECT",
  "WAITER_WRONG_PUNCH",
  "OTHER",
]);
export const wastageKindEnum = pgEnum("wastage_kind", [
  "KITCHEN_SPOILED",
  "POS_RETURNED_WASTE",
  "POS_RETURNED_REUSED",
]);

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  cuisineType: text("cuisine_type").notNull(),
  city: text("city").notNull().default(""),
  region: text("region").notNull().default(""),
  country: text("country").notNull().default("US"),
  currency: text("currency").default("USD").notNull(),
  varianceThresholdPercent: numeric("variance_threshold_percent", {
    precision: 5,
    scale: 2,
  }).default("5.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    email: text("email").unique(),
    phone: text("phone").unique(),
    passwordHash: text("password_hash"),
    role: roleEnum("role").notNull(),
    hourlyRateCents: numeric("hourly_rate_cents", { precision: 10, scale: 0 }),
    digestOptIn: boolean("digest_opt_in").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("users_restaurant_idx").on(t.restaurantId),
    index("users_phone_idx").on(t.phone),
  ],
);

/** Short-lived SMS OTP challenges for owner mobile auth */
export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull(), // login | register | invite
    payload: text("payload"), // JSON for pending registration / invite
    attempts: numeric("attempts", { precision: 2, scale: 0 }).default("0").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("otp_phone_idx").on(t.phone)],
);

/** Owner-issued staff join links — no staff self-registration */
export const staffInvites = pgTable(
  "staff_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    phone: text("phone").notNull(),
    name: text("name"),
    role: roleEnum("role").notNull(),
    token: text("token").notNull().unique(),
    acceptedAt: timestamp("accepted_at"),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("staff_invites_restaurant_idx").on(t.restaurantId),
    index("staff_invites_token_idx").on(t.token),
    index("staff_invites_phone_idx").on(t.phone),
  ],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: unitEnum("unit").notNull(),
    /** Empty means the stock unit is the base unit. */
    baseUnit: text("base_unit").default("").notNull(),
    allergens: text("allergens").default("").notNull(),
    costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }).notNull(),
    currentStock: numeric("current_stock", { precision: 12, scale: 3 })
      .default("0.000")
      .notNull(),
    parLevel: numeric("par_level", { precision: 12, scale: 3 }).default("0.000"),
    shelfLifeDays: numeric("shelf_life_days", { precision: 4, scale: 1 }).default(
      "3.0",
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ingredients_restaurant_idx").on(t.restaurantId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    sellingPrice: numeric("selling_price", { precision: 10, scale: 2 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    menuApprovalStatus: approvalStatusEnum("menu_approval_status")
      .default("DRAFT")
      .notNull(),
    recipeApprovalStatus: approvalStatusEnum("recipe_approval_status")
      .default("DRAFT")
      .notNull(),
    chefSignedAt: timestamp("chef_signed_at"),
    ownerApprovedAt: timestamp("owner_approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("menu_items_restaurant_idx").on(t.restaurantId)],
);

export const recipeBoms = pgTable("recipe_boms", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuItemId: uuid("menu_item_id")
    .references(() => menuItems.id, { onDelete: "cascade" })
    .notNull(),
  ingredientId: uuid("ingredient_id")
    .references(() => ingredients.id, { onDelete: "restrict" })
    .notNull(),
  grossQuantity: numeric("gross_quantity", { precision: 10, scale: 3 }).notNull(),
  shrinkageMarginPercent: numeric("shrinkage_margin_percent", {
    precision: 5,
    scale: 2,
  }).default("0.00"),
  /** Usable yield after trim and cooking loss. 100 means no extra loss. */
  yieldPercent: numeric("yield_percent", { precision: 5, scale: 2 })
    .default("100.00")
    .notNull(),
});

export const stockReceipts = pgTable(
  "stock_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id)
      .notNull(),
    receivedBy: uuid("received_by")
      .references(() => users.id)
      .notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
    supplierNote: text("supplier_note"),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (t) => [index("stock_receipts_restaurant_idx").on(t.restaurantId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    waiterId: uuid("waiter_id")
      .references(() => users.id)
      .notNull(),
    tableNumber: text("table_number").notNull(),
    status: orderStatusEnum("status").default("PENDING").notNull(),
    source: orderSourceEnum("source").default("restman").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("orders_restaurant_idx").on(t.restaurantId)],
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  menuItemId: uuid("menu_item_id")
    .references(() => menuItems.id)
    .notNull(),
  quantity: numeric("quantity", { precision: 6, scale: 0 }).default("1").notNull(),
  status: orderStatusEnum("status").default("PENDING").notNull(),
  returnReason: returnReasonEnum("return_reason"),
  isWasted: boolean("is_wasted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wastageLogs = pgTable(
  "wastage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id)
      .notNull(),
    loggedBy: uuid("logged_by")
      .references(() => users.id)
      .notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
    kind: wastageKindEnum("kind").default("KITCHEN_SPOILED").notNull(),
    reason: text("reason").notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("wastage_logs_restaurant_idx").on(t.restaurantId)],
);

export const shiftCounts = pgTable(
  "shift_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id)
      .notNull(),
    countedBy: uuid("counted_by")
      .references(() => users.id)
      .notNull(),
    physicalCount: numeric("physical_count", { precision: 12, scale: 3 }).notNull(),
    theoreticalBalance: numeric("theoretical_balance", {
      precision: 12,
      scale: 3,
    }).notNull(),
    variance: numeric("variance", { precision: 12, scale: 3 }).notNull(),
    unaccountedCost: numeric("unaccounted_cost", {
      precision: 10,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("shift_counts_restaurant_idx").on(t.restaurantId)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").default("America/Chicago").notNull(),
    closeHour: numeric("close_hour", { precision: 2, scale: 0 }).default("22").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("locations_restaurant_idx").on(t.restaurantId)],
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    provider: integrationProviderEnum("provider").notNull(),
    status: connectionStatusEnum("status").default("connected").notNull(),
    encryptedTokens: text("encrypted_tokens"),
    scopes: text("scopes"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("integration_connections_restaurant_idx").on(t.restaurantId)],
);

export const posItems = pgTable(
  "pos_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .references(() => integrationConnections.id, { onDelete: "cascade" })
      .notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    variation: text("variation"),
    priceCents: numeric("price_cents", { precision: 10, scale: 0 }).notNull(),
  },
  (t) => [
    uniqueIndex("pos_items_external_uidx").on(t.connectionId, t.externalId),
  ],
);

export const posItemMappings = pgTable(
  "pos_item_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    posItemId: uuid("pos_item_id")
      .references(() => posItems.id, { onDelete: "cascade" })
      .notNull(),
    dishId: uuid("dish_id")
      .references(() => menuItems.id, { onDelete: "cascade" })
      .notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    mappedBy: text("mapped_by").notNull(),
    /** confirmed counts in usage. suggested is a chef proposal. */
    status: text("status").default("confirmed").notNull(),
    mappedAt: timestamp("mapped_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("pos_item_mappings_item_uidx").on(t.posItemId)],
);

export const posSaleLines = pgTable(
  "pos_sale_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .references(() => integrationConnections.id, { onDelete: "cascade" })
      .notNull(),
    externalLineId: text("external_line_id").notNull(),
    posItemId: uuid("pos_item_id")
      .references(() => posItems.id, { onDelete: "cascade" })
      .notNull(),
    qty: numeric("qty", { precision: 10, scale: 3 }).notNull(),
    netCents: numeric("net_cents", { precision: 12, scale: 0 }).notNull(),
    channel: text("channel").default("in_house").notNull(),
    soldAt: timestamp("sold_at").notNull(),
  },
  (t) => [
    uniqueIndex("pos_sale_lines_external_uidx").on(
      t.connectionId,
      t.externalLineId,
    ),
    index("pos_sale_lines_sold_idx").on(t.soldAt),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    orderCutoff: text("order_cutoff"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("suppliers_restaurant_idx").on(t.restaurantId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "cascade",
    }),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    imageUrl: text("image_url"),
    status: invoiceStatusEnum("status").default("draft").notNull(),
    totalCents: numeric("total_cents", { precision: 12, scale: 0 })
      .default("0")
      .notNull(),
    invoiceDate: timestamp("invoice_date").defaultNow().notNull(),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("invoices_restaurant_idx").on(t.restaurantId)],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .references(() => invoices.id, { onDelete: "cascade" })
    .notNull(),
  rawText: text("raw_text").notNull(),
  ingredientId: uuid("ingredient_id").references(() => ingredients.id),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
  unitPriceCents: numeric("unit_price_cents", {
    precision: 12,
    scale: 0,
  }).notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
});

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id, { onDelete: "cascade" })
      .notNull(),
    supplierName: text("supplier_name"),
    unitPriceCents: numeric("unit_price_cents", {
      precision: 12,
      scale: 0,
    }).notNull(),
    observedAt: timestamp("observed_at").defaultNow().notNull(),
  },
  (t) => [index("price_history_ingredient_idx").on(t.ingredientId)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    readAt: timestamp("read_at"),
  },
  (t) => [index("alerts_restaurant_idx").on(t.restaurantId)],
);

export const supplierItems = pgTable(
  "supplier_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .references(() => suppliers.id, { onDelete: "cascade" })
      .notNull(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id, { onDelete: "cascade" })
      .notNull(),
    packSize: numeric("pack_size", { precision: 12, scale: 3 }).default("1").notNull(),
    packUnit: text("pack_unit").default("").notNull(),
    lastPriceCents: numeric("last_price_cents", { precision: 12, scale: 0 })
      .default("0")
      .notNull(),
  },
  (t) => [index("supplier_items_supplier_idx").on(t.supplierId)],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    status: text("status").default("draft").notNull(),
    sentAt: timestamp("sent_at"),
    sentBy: uuid("sent_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("purchase_orders_restaurant_idx").on(t.restaurantId)],
);

export const poLines = pgTable("po_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseOrderId: uuid("purchase_order_id")
    .references(() => purchaseOrders.id, { onDelete: "cascade" })
    .notNull(),
  ingredientId: uuid("ingredient_id")
    .references(() => ingredients.id)
    .notNull(),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
});

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .references(() => integrationConnections.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: numeric("attempts", { precision: 4, scale: 0 }).default("0").notNull(),
    lastError: text("last_error"),
    runAt: timestamp("run_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("sync_jobs_connection_idx").on(t.connectionId)],
);

export const accountingExports = pgTable(
  "accounting_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    status: text("status").default("queued").notNull(),
    payload: text("payload").notNull(),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("accounting_exports_restaurant_idx").on(t.restaurantId)],
);

export const invoiceFiles = pgTable("invoice_files", {
  invoiceId: uuid("invoice_id")
    .primaryKey()
    .references(() => invoices.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: text("data").notNull(),
});

export const digestRuns = pgTable(
  "digest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    channel: text("channel").notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [index("digest_runs_restaurant_idx").on(t.restaurantId)],
);

export const staffShifts = pgTable(
  "staff_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    hourlyRateCents: numeric("hourly_rate_cents", { precision: 10, scale: 0 })
      .default("0")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("staff_shifts_restaurant_idx").on(t.restaurantId)],
);

export const foodSafetyLogs = pgTable(
  "food_safety_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    kind: text("kind").notNull(),
    reading: text("reading").notNull(),
    note: text("note"),
    photo: text("photo"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("food_safety_logs_restaurant_idx").on(t.restaurantId)],
);

export const locationStock = pgTable(
  "location_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id, { onDelete: "cascade" })
      .notNull(),
    qty: numeric("qty", { precision: 12, scale: 3 }).default("0").notNull(),
  },
  (t) => [
    uniqueIndex("location_stock_uidx").on(t.locationId, t.ingredientId),
  ],
);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    fromLocationId: uuid("from_location_id")
      .references(() => locations.id)
      .notNull(),
    toLocationId: uuid("to_location_id")
      .references(() => locations.id)
      .notNull(),
    ingredientId: uuid("ingredient_id")
      .references(() => ingredients.id)
      .notNull(),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
    createdBy: uuid("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("stock_transfers_restaurant_idx").on(t.restaurantId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .references(() => restaurants.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    target: text("target").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("audit_events_restaurant_idx").on(t.restaurantId)],
);

/** One-shot deploy tasks. Kept in schema so drizzle push does not drop the marker. */
export const maintenanceFlags = pgTable("maintenance_flags", {
  key: text("key").primaryKey(),
  doneAt: timestamp("done_at").defaultNow().notNull(),
});

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  users: many(users),
  ingredients: many(ingredients),
  menuItems: many(menuItems),
  orders: many(orders),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [menuItems.restaurantId],
    references: [restaurants.id],
  }),
  recipeBoms: many(recipeBoms),
}));

export const recipeBomsRelations = relations(recipeBoms, ({ one }) => ({
  menuItem: one(menuItems, {
    fields: [recipeBoms.menuItemId],
    references: [menuItems.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipeBoms.ingredientId],
    references: [ingredients.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [orders.restaurantId],
    references: [restaurants.id],
  }),
  waiter: one(users, {
    fields: [orders.waiterId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));
