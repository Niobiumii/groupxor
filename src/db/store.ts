import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type {
  MenuItem,
  PaymentRequest,
  PaymentRequestStatus,
  Plan,
  Settings,
  UserFlowState,
} from "../types/models.js";

type SqliteBoolean = 0 | 1;

const DEFAULT_SETTINGS: Settings = {
  botName: "Premium Access Bot",
  welcomeMessage:
    "Welcome. Use the menu below to view plans, buy access, or contact support.",
  plansTitle: "Choose the plan that fits your audience.",
  paymentInstructions:
    "Send payment to your preferred account, then upload a screenshot or transaction ID here. An admin will verify it manually.",
  supportText: "Need help? Reply to this message or contact @support.",
  successMessage:
    "Payment approved. Your private channel access link is ready below.",
  rejectionMessage:
    "Your payment proof was rejected. Please try again or contact support.",
  adminChatId: config.adminChatId,
  privateChannelId: config.privateChannelId,
};

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_label TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS payment_requests (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT,
      full_name TEXT NOT NULL,
      plan_id INTEGER NOT NULL,
      plan_name TEXT NOT NULL,
      status TEXT NOT NULL,
      proof_type TEXT NOT NULL,
      proof_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_states (
      user_id INTEGER PRIMARY KEY,
      state_json TEXT NOT NULL
    );
  `);

  seedDefaults();
}

function seedDefaults(): void {
  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );

  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
    insertSetting.run(key, value);
  });

  const planCount = db
    .prepare("SELECT COUNT(*) as count FROM plans")
    .get() as { count: number };

  if (planCount.count === 0) {
    db.prepare(
      `
        INSERT INTO plans (name, description, price_label, duration_days, sort_order, is_active)
        VALUES
          ('Starter', 'Great for first-time buyers.', '$19 / month', 30, 1, 1),
          ('Pro', 'Best value for active subscribers.', '$49 / 3 months', 90, 2, 1),
          ('VIP', 'Premium support and exclusive access.', '$99 / 6 months', 180, 3, 1)
      `,
    ).run();
  }

  const menuCount = db
    .prepare("SELECT COUNT(*) as count FROM menu_items")
    .get() as { count: number };

  if (menuCount.count === 0) {
    db.prepare(
      `
        INSERT INTO menu_items (label, type, value, sort_order, is_active)
        VALUES
          ('View Plans', 'plans', '', 1, 1),
          ('Support', 'support', '', 2, 1),
          ('About Product', 'custom_text', 'Replace this text in the admin panel with your product pitch, FAQs, bonus details, or onboarding steps.', 3, 1)
      `,
    ).run();
  }
}

export function getSettings(): Settings {
  const rows = db
    .prepare("SELECT key, value FROM settings")
    .all() as Array<{ key: keyof Settings; value: string }>;

  const merged = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    merged[row.key] = row.value;
  }

  return merged;
}

export function saveSettings(input: Settings): void {
  const statement = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  const transaction = db.transaction((settings: Settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      statement.run(key, value);
    });
  });

  transaction(input);
}

export function getPlans(): Plan[] {
  const rows = db
    .prepare(
      "SELECT id, name, description, price_label, duration_days, sort_order, is_active FROM plans ORDER BY sort_order ASC, id ASC",
    )
    .all() as Array<{
      id: number;
      name: string;
      description: string;
      price_label: string;
      duration_days: number;
      sort_order: number;
      is_active: SqliteBoolean;
    }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    priceLabel: row.price_label,
    durationDays: row.duration_days,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
  }));
}

export function getActivePlans(): Plan[] {
  return getPlans().filter((plan) => plan.isActive);
}

export function getPlanById(planId: number): Plan | undefined {
  return getPlans().find((plan) => plan.id === planId);
}

export function upsertPlan(input: Omit<Plan, "id"> & { id?: number }): void {
  if (input.id) {
    db.prepare(
      `
        UPDATE plans
        SET name = ?, description = ?, price_label = ?, duration_days = ?, sort_order = ?, is_active = ?
        WHERE id = ?
      `,
    ).run(
      input.name,
      input.description,
      input.priceLabel,
      input.durationDays,
      input.sortOrder,
      input.isActive ? 1 : 0,
      input.id,
    );
    return;
  }

  db.prepare(
    `
      INSERT INTO plans (name, description, price_label, duration_days, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.name,
    input.description,
    input.priceLabel,
    input.durationDays,
    input.sortOrder,
    input.isActive ? 1 : 0,
  );
}

export function deletePlan(planId: number): void {
  db.prepare("DELETE FROM plans WHERE id = ?").run(planId);
}

export function getMenuItems(): MenuItem[] {
  const rows = db
    .prepare(
      "SELECT id, label, type, value, sort_order, is_active FROM menu_items ORDER BY sort_order ASC, id ASC",
    )
    .all() as Array<{
      id: number;
      label: string;
      type: MenuItem["type"];
      value: string;
      sort_order: number;
      is_active: SqliteBoolean;
    }>;

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    type: row.type,
    value: row.value,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
  }));
}

export function getActiveMenuItems(): MenuItem[] {
  return getMenuItems().filter((item) => item.isActive);
}

export function getMenuItemById(menuItemId: number): MenuItem | undefined {
  return getMenuItems().find((item) => item.id === menuItemId);
}

export function upsertMenuItem(input: Omit<MenuItem, "id"> & { id?: number }): void {
  if (input.id) {
    db.prepare(
      `
        UPDATE menu_items
        SET label = ?, type = ?, value = ?, sort_order = ?, is_active = ?
        WHERE id = ?
      `,
    ).run(
      input.label,
      input.type,
      input.value,
      input.sortOrder,
      input.isActive ? 1 : 0,
      input.id,
    );
    return;
  }

  db.prepare(
    `
      INSERT INTO menu_items (label, type, value, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(input.label, input.type, input.value, input.sortOrder, input.isActive ? 1 : 0);
}

export function deleteMenuItem(menuItemId: number): void {
  db.prepare("DELETE FROM menu_items WHERE id = ?").run(menuItemId);
}

export function getUserState(userId: number): UserFlowState {
  const row = db
    .prepare("SELECT state_json FROM user_states WHERE user_id = ?")
    .get(userId) as { state_json: string } | undefined;

  if (!row) {
    return { step: "idle" };
  }

  return JSON.parse(row.state_json) as UserFlowState;
}

export function setUserState(userId: number, state: UserFlowState): void {
  db.prepare(
    `
      INSERT INTO user_states (user_id, state_json)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json
    `,
  ).run(userId, JSON.stringify(state));
}

export function createPaymentRequest(input: {
  userId: number;
  username: string | null;
  fullName: string;
  planId: number;
  planName: string;
  proofType: "text" | "photo" | "document";
  proofValue: string;
}): PaymentRequest {
  const paymentRequest: PaymentRequest = {
    id: randomUUID(),
    userId: input.userId,
    username: input.username,
    fullName: input.fullName,
    planId: input.planId,
    planName: input.planName,
    status: "pending",
    proofType: input.proofType,
    proofValue: input.proofValue,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  };

  db.prepare(
    `
      INSERT INTO payment_requests (
        id, user_id, username, full_name, plan_id, plan_name, status, proof_type, proof_value, created_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    paymentRequest.id,
    paymentRequest.userId,
    paymentRequest.username,
    paymentRequest.fullName,
    paymentRequest.planId,
    paymentRequest.planName,
    paymentRequest.status,
    paymentRequest.proofType,
    paymentRequest.proofValue,
    paymentRequest.createdAt,
    paymentRequest.reviewedAt,
  );

  return paymentRequest;
}

export function getPaymentRequests(): PaymentRequest[] {
  const rows = db
    .prepare(
      `
        SELECT
          id, user_id, username, full_name, plan_id, plan_name, status, proof_type, proof_value, created_at, reviewed_at
        FROM payment_requests
        ORDER BY created_at DESC
      `,
    )
    .all() as Array<{
      id: string;
      user_id: number;
      username: string | null;
      full_name: string;
      plan_id: number;
      plan_name: string;
      status: PaymentRequestStatus;
      proof_type: "text" | "photo" | "document";
      proof_value: string;
      created_at: string;
      reviewed_at: string | null;
    }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    proofType: row.proof_type,
    proofValue: row.proof_value,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));
}

export function getPaymentRequestById(requestId: string): PaymentRequest | undefined {
  return getPaymentRequests().find((request) => request.id === requestId);
}

export function updatePaymentRequestStatus(
  requestId: string,
  status: PaymentRequestStatus,
): PaymentRequest | undefined {
  const reviewedAt = new Date().toISOString();
  db.prepare(
    "UPDATE payment_requests SET status = ?, reviewed_at = ? WHERE id = ?",
  ).run(status, reviewedAt, requestId);

  return getPaymentRequestById(requestId);
}
