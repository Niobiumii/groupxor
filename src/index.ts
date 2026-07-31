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

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/", (_req, res) => {
    res.redirect("/admin");
  });

  app.use("/admin", createAdminRouter(botService));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).send("Internal server error");
  });

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Admin panel running at ${config.baseUrl}`);
    console.log(`Health check available at ${config.baseUrl}/healthz`);

    void botService
      .launch()
      .then(() => {
        console.log("Telegram bot is running.");
      })
      .catch((error) => {
        console.error("Telegram bot failed to start:", error);
      });
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

void main().catch((error) => {
  console.error("Application failed to start:", error);
  process.exit(1);
});

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
