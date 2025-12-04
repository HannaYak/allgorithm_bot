import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startBot, getBot } from "../bot";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Initialize Telegram bot first
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[Bot] TELEGRAM_BOT_TOKEN is not set!');
    process.exit(1);
  }
  
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  try {
    await startBot(token, webhookUrl);
    console.log('[Bot] Telegram bot initialized successfully');
  } catch (error) {
    console.error('[Bot] Failed to initialize bot:', error);
    process.exit(1);
  }
  
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Telegram bot webhook endpoint
  app.post('/api/telegram', express.json(), async (req, res) => {
    try {
      const bot = getBot();
      if (!bot) {
        console.error('[Telegram] Bot not initialized');
        return res.status(500).json({ error: 'Bot not initialized' });
      }
      await bot.handleUpdate(req.body, res);
    } catch (error) {
      console.error('[Telegram] Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('[Server] Shutting down...');
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log('[Bot] Telegram bot is ready to receive messages');
  });
}

startServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
