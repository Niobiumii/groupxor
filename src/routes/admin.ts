import { Router } from "express";
import { config } from "../config.js";
import {
  deleteMenuItem,
  deletePlan,
  getMenuItems,
  getPaymentRequests,
  getPlans,
  getSettings,
  saveSettings,
  upsertMenuItem,
  upsertPlan,
} from "../db/store.js";
import type { SubscriptionBotService } from "../services/bot-service.js";
import type { MenuItem } from "../types/models.js";

function toBoolean(value: unknown): boolean {
  return value === "on" || value === "true" || value === true;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createAdminRouter(botService: SubscriptionBotService): Router {
  const router = Router();

  router.get("/login", (req, res) => {
    if (req.session.isAuthenticated) {
      res.redirect("/admin");
      return;
    }

    res.render("admin/login", { error: null });
  });

  router.post("/login", (req, res) => {
    if (req.body.password === config.adminPanelPassword) {
      req.session.isAuthenticated = true;
      res.redirect("/admin");
      return;
    }

    res.status(401).render("admin/login", { error: "Invalid password." });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  });

  router.use((req, res, next) => {
    if (!req.session.isAuthenticated) {
      res.redirect("/admin/login");
      return;
    }

    next();
  });

  router.get("/", (_req, res) => {
    res.render("admin/dashboard", {
      settings: getSettings(),
      plans: getPlans(),
      menuItems: getMenuItems(),
      paymentRequests: getPaymentRequests(),
      menuTypes: ["plans", "support", "custom_text", "custom_url"] satisfies MenuItem["type"][],
    });
  });

  router.post("/settings", (req, res) => {
    saveSettings({
      botName: String(req.body.botName ?? ""),
      welcomeMessage: String(req.body.welcomeMessage ?? ""),
      plansTitle: String(req.body.plansTitle ?? ""),
      paymentInstructions: String(req.body.paymentInstructions ?? ""),
      supportText: String(req.body.supportText ?? ""),
      successMessage: String(req.body.successMessage ?? ""),
      rejectionMessage: String(req.body.rejectionMessage ?? ""),
      adminChatId: String(req.body.adminChatId ?? ""),
      privateChannelId: String(req.body.privateChannelId ?? ""),
    });

    res.redirect("/admin");
  });

  router.post("/plans", (req, res) => {
    upsertPlan({
      id: req.body.id ? toNumber(req.body.id) : undefined,
      name: String(req.body.name ?? ""),
      description: String(req.body.description ?? ""),
      priceLabel: String(req.body.priceLabel ?? ""),
      durationDays: toNumber(req.body.durationDays, 30),
      sortOrder: toNumber(req.body.sortOrder, 0),
      isActive: toBoolean(req.body.isActive),
    });

    res.redirect("/admin");
  });

  router.post("/plans/:id/delete", (req, res) => {
    deletePlan(toNumber(req.params.id));
    res.redirect("/admin");
  });

  router.post("/menu-items", (req, res) => {
    upsertMenuItem({
      id: req.body.id ? toNumber(req.body.id) : undefined,
      label: String(req.body.label ?? ""),
      type: String(req.body.type ?? "custom_text") as MenuItem["type"],
      value: String(req.body.value ?? ""),
      sortOrder: toNumber(req.body.sortOrder, 0),
      isActive: toBoolean(req.body.isActive),
    });

    res.redirect("/admin");
  });

  router.post("/menu-items/:id/delete", (req, res) => {
    deleteMenuItem(toNumber(req.params.id));
    res.redirect("/admin");
  });

  router.post("/payments/:id/approve", async (req, res, next) => {
    try {
      await botService.approvePaymentRequest(req.params.id);
      res.redirect("/admin");
    } catch (error) {
      next(error);
    }
  });

  router.post("/payments/:id/reject", async (req, res, next) => {
    try {
      await botService.rejectPaymentRequest(req.params.id);
      res.redirect("/admin");
    } catch (error) {
      next(error);
    }
  });

  return router;
}
