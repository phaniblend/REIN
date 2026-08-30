import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  boolean,
  pgEnum,
  index,
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
    email: text("email").unique().notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("users_restaurant_idx").on(t.restaurantId)],
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
