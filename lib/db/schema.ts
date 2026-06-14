import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "done", "failed"]);
export const jobTypeEnum = pgEnum("job_type", ["image", "tts", "headshot-training", "headshot-generate", "headshot-edit"]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "credit_purchase",
  "subscription_payment",
  "credit_spend",
  "credit_refund",
  "signup_bonus"
]);
export const creditKindEnum = pgEnum("credit_kind", ["blue", "gold"]);
export const creditBucketEnum = pgEnum("credit_bucket", ["subscription", "pack"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const credits = pgTable("credits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  subscriptionBlueBalance: integer("subscription_blue_balance").default(0).notNull(),
  subscriptionGoldBalance: integer("subscription_gold_balance").default(0).notNull(),
  packBlueBalance: integer("pack_blue_balance").default(0).notNull(),
  packGoldBalance: integer("pack_gold_balance").default(0).notNull(),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
  subscriptionStatus: text("subscription_status").default("none").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  check("credits_subscription_blue_balance_non_negative", sql`${table.subscriptionBlueBalance} >= 0`),
  check("credits_subscription_gold_balance_non_negative", sql`${table.subscriptionGoldBalance} >= 0`),
  check("credits_pack_blue_balance_non_negative", sql`${table.packBlueBalance} >= 0`),
  check("credits_pack_gold_balance_non_negative", sql`${table.packGoldBalance} >= 0`)
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  plan: text("plan").default("free").notNull(),
  status: text("status").default("inactive").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  lastStripeEventId: text("last_stripe_event_id"),
  lastStripeEventCreatedAt: timestamp("last_stripe_event_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: jobTypeEnum("type").notNull(),
  status: jobStatusEnum("status").default("pending").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  resultUrl: text("result_url"),
  result: jsonb("result").$type<unknown>(),
  error: text("error"),
  creditsUsed: integer("credits_used").notNull(),
  creditKind: creditKindEnum("credit_kind").default("blue").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  credits: integer("credits").notNull(),
  creditKind: creditKindEnum("credit_kind").default("blue").notNull(),
  creditBucket: creditBucketEnum("credit_bucket").default("pack").notNull(),
  amountCents: integer("amount_cents"),
  stripeEventId: text("stripe_event_id").unique(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const userRelations = relations(users, ({ one, many }) => ({
  credits: one(credits),
  jobs: many(jobs),
  subscriptions: many(subscriptions),
  transactions: many(transactions)
}));

export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobType = typeof jobTypeEnum.enumValues[number];
export type JobStatus = typeof jobStatusEnum.enumValues[number];
export type CreditKind = typeof creditKindEnum.enumValues[number];
export type CreditBucket = typeof creditBucketEnum.enumValues[number];
