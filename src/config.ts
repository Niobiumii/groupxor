import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  botUsername: process.env.BOT_USERNAME ?? "",
  adminChatId: process.env.ADMIN_CHAT_ID ?? "",
  privateChannelId: process.env.PRIVATE_CHANNEL_ID ?? "",
  adminPanelPassword: required("ADMIN_PANEL_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  port: Number(process.env.PORT ?? "3000"),
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  dbPath: process.env.DB_PATH ?? "./data.sqlite",
};
