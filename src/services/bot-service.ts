import { Markup, Telegraf } from "telegraf";
import { config } from "../config.js";
import {
  createPaymentRequest,
  getActiveMenuItems,
  getActivePlans,
  getMenuItemById,
  getPaymentRequestById,
  getPlanById,
  getSettings,
  getUserState,
  setUserState,
  updatePaymentRequestStatus,
} from "../db/store.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export class SubscriptionBotService {
  readonly bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(config.botToken);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.bot.start(async (ctx) => {
      await this.sendHomeMenu(ctx.chat.id);
    });

    this.bot.command("menu", async (ctx) => {
      await this.sendHomeMenu(ctx.chat.id);
    });

    this.bot.action("home", async (ctx) => {
      await ctx.answerCbQuery();
      if (ctx.chat) {
        await this.sendHomeMenu(ctx.chat.id);
      }
    });

    this.bot.action("menu:plans", async (ctx) => {
      await ctx.answerCbQuery();
      if (ctx.chat) {
        await this.sendPlansMenu(ctx.chat.id);
      }
    });

    this.bot.action("menu:support", async (ctx) => {
      await ctx.answerCbQuery();
      const settings = getSettings();
      await ctx.reply(settings.supportText);
    });

    this.bot.action(/^menu:item:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const menuItemId = Number(ctx.match[1]);
      const menuItem = getMenuItemById(menuItemId);

      if (!menuItem || !menuItem.isActive) {
        await ctx.reply("This menu item is no longer available.");
        return;
      }

      if (menuItem.type === "custom_url") {
        await ctx.reply(`Open this link: ${menuItem.value}`);
        return;
      }

      await ctx.reply(menuItem.value || "No content configured yet.");
    });

    this.bot.action(/^plan:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const planId = Number(ctx.match[1]);
      const plan = getPlanById(planId);

      if (!plan || !plan.isActive) {
        await ctx.reply("This plan is no longer available.");
        return;
      }

      await ctx.reply(
        `<b>${escapeHtml(plan.name)}</b>\n${escapeHtml(plan.description)}\n\nPrice: ${escapeHtml(plan.priceLabel)}\nAccess: ${plan.durationDays} days`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("Buy This Plan", `buy:${plan.id}`)],
            [Markup.button.callback("Back", "menu:plans")],
          ]),
        },
      );
    });

    this.bot.action(/^buy:(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const planId = Number(ctx.match[1]);
      const plan = getPlanById(planId);

      if (!plan || !plan.isActive) {
        await ctx.reply("This plan is no longer available.");
        return;
      }

      setUserState(ctx.from.id, { step: "awaiting_payment_proof", planId });

      const settings = getSettings();
      await ctx.reply(
        `You selected ${plan.name}.\n\n${settings.paymentInstructions}\n\nSend a payment screenshot, document, or transaction ID in your next message.`,
      );
    });

    this.bot.action(/^admin:(approve|reject):([0-9a-f-]+)$/, async (ctx) => {
      const action = ctx.match[1] as "approve" | "reject";
      const requestId = ctx.match[2];

      if (!ctx.chat || !this.isAdminChat(String(ctx.chat.id))) {
        await ctx.answerCbQuery("Not authorized", { show_alert: true });
        return;
      }

      if (action === "approve") {
        await this.approvePaymentRequest(requestId);
        await ctx.answerCbQuery("Approved");
        await ctx.reply(`Approved request ${requestId}.`);
      } else {
        await this.rejectPaymentRequest(requestId);
        await ctx.answerCbQuery("Rejected");
        await ctx.reply(`Rejected request ${requestId}.`);
      }
    });

    this.bot.on("message", async (ctx) => {
      const state = getUserState(ctx.from.id);

      if (state.step !== "awaiting_payment_proof") {
        return;
      }

      const plan = getPlanById(state.planId);
      if (!plan || !plan.isActive) {
        setUserState(ctx.from.id, { step: "idle" });
        await ctx.reply("That plan is no longer available. Please choose another one.");
        return;
      }

      let proofType: "text" | "photo" | "document";
      let proofValue: string;

      if ("photo" in ctx.message && ctx.message.photo.length > 0) {
        proofType = "photo";
        proofValue = ctx.message.photo.at(-1)?.file_id ?? "";
      } else if ("document" in ctx.message && ctx.message.document) {
        proofType = "document";
        proofValue = ctx.message.document.file_id;
      } else if ("text" in ctx.message && ctx.message.text) {
        proofType = "text";
        proofValue = ctx.message.text;
      } else {
        await ctx.reply("Please send a screenshot, document, or transaction ID as proof.");
        return;
      }

      const paymentRequest = createPaymentRequest({
        userId: ctx.from.id,
        username: ctx.from.username ?? null,
        fullName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
        planId: plan.id,
        planName: plan.name,
        proofType,
        proofValue,
      });

      setUserState(ctx.from.id, { step: "idle" });

      await ctx.reply(
        "Your payment proof has been submitted for review. You will receive your channel access link after approval.",
      );

      await this.notifyAdminOfPayment(paymentRequest.id);
    });
  }

  async launch(): Promise<void> {
    await this.bot.launch();
  }

  async stop(signal: string): Promise<void> {
    this.bot.stop(signal);
  }

  async approvePaymentRequest(requestId: string): Promise<void> {
    const request = getPaymentRequestById(requestId);
    if (!request || request.status !== "pending") {
      return;
    }

    const settings = getSettings();
    const updated = updatePaymentRequestStatus(requestId, "approved");

    if (!updated) {
      return;
    }

    const inviteLink = await this.bot.telegram.createChatInviteLink(
      settings.privateChannelId,
      {
        expire_date: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        member_limit: 1,
        name: `access-${request.userId}-${Date.now()}`,
      },
    );

    await this.bot.telegram.sendMessage(
      request.userId,
      `${settings.successMessage}\n\n${inviteLink.invite_link}`,
    );
  }

  async rejectPaymentRequest(requestId: string): Promise<void> {
    const request = getPaymentRequestById(requestId);
    if (!request || request.status !== "pending") {
      return;
    }

    const settings = getSettings();
    const updated = updatePaymentRequestStatus(requestId, "rejected");
    if (!updated) {
      return;
    }

    await this.bot.telegram.sendMessage(request.userId, settings.rejectionMessage);
  }

  async sendHomeMenu(chatId: number | string): Promise<void> {
    const settings = getSettings();
    const menuItems = getActiveMenuItems();
    const buttons = menuItems.map((item) => {
      if (item.type === "custom_url") {
        return [Markup.button.url(item.label, item.value)];
      }

      if (item.type === "plans") {
        return [Markup.button.callback(item.label, "menu:plans")];
      }

      if (item.type === "support") {
        return [Markup.button.callback(item.label, "menu:support")];
      }

      return [Markup.button.callback(item.label, `menu:item:${item.id}`)];
    });

    await this.bot.telegram.sendMessage(
      chatId,
      `<b>${escapeHtml(settings.botName)}</b>\n${escapeHtml(settings.welcomeMessage)}`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(buttons),
      },
    );
  }

  async sendPlansMenu(chatId: number | string): Promise<void> {
    const settings = getSettings();
    const plans = getActivePlans();

    if (plans.length === 0) {
      await this.bot.telegram.sendMessage(chatId, "No active plans are configured yet.");
      return;
    }

    const buttons = plans.map((plan) => [
      Markup.button.callback(`${plan.name} - ${plan.priceLabel}`, `plan:${plan.id}`),
    ]);
    buttons.push([Markup.button.callback("Back", "home")]);

    await this.bot.telegram.sendMessage(chatId, settings.plansTitle, {
      ...Markup.inlineKeyboard(buttons),
    });
  }

  private async notifyAdminOfPayment(requestId: string): Promise<void> {
    const request = getPaymentRequestById(requestId);
    const settings = getSettings();

    if (!request || !settings.adminChatId) {
      return;
    }

    const summary =
      `New payment proof submitted\n\n` +
      `Request: ${request.id}\n` +
      `User: ${request.fullName}${request.username ? ` (@${request.username})` : ""}\n` +
      `Plan: ${request.planName}\n` +
      `User ID: ${request.userId}`;

    if (request.proofType === "photo") {
      await this.bot.telegram.sendPhoto(settings.adminChatId, request.proofValue, {
        caption: summary,
      });
    } else if (request.proofType === "document") {
      await this.bot.telegram.sendDocument(settings.adminChatId, request.proofValue, {
        caption: summary,
      });
    } else {
      await this.bot.telegram.sendMessage(
        settings.adminChatId,
        `${summary}\nProof: ${request.proofValue}`,
      );
    }

    await this.bot.telegram.sendMessage(
      settings.adminChatId,
      "Review this payment request:",
      {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("Approve", `admin:approve:${request.id}`),
            Markup.button.callback("Reject", `admin:reject:${request.id}`),
          ],
        ]),
      },
    );
  }

  private isAdminChat(chatId: string): boolean {
    const settings = getSettings();
    return chatId === settings.adminChatId;
  }
}
