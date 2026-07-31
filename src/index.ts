import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initializeDatabase } from "./db/store.js";
import { createAdminRouter } from "./routes/admin.js";
import { SubscriptionBotService } from "./services/bot-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main(): Promise<void> {
  initializeDatabase();

  const botService = new SubscriptionBotService();
  await botService.launch();

  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      },
    }),
  );

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/", (_req, res) => {
    res.redirect("/admin");
  });

  app.use("/admin", createAdminRouter(botService));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).send("Internal server error");
  });

  const server = app.listen(config.port, () => {
    console.log(`Admin panel running at ${config.baseUrl}`);
    console.log("Telegram bot is running.");
  });

  const shutdown = async (signal: string) => {
    await botService.stop(signal);
    server.close(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main();
