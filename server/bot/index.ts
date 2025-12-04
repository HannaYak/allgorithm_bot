// server/bot/index.ts
import { Telegraf } from 'telegraf';
import { initializeHandlers, BotContext } from './handlers';
import { initializeDefaultGames } from './games'; // <--- Добавили импорт

let bot: Telegraf<BotContext> | null = null;

export function initializeBot(token: string): Telegraf<BotContext> {
  if (bot) return bot;

  bot = new Telegraf<BotContext>(token);

  bot.use(async (ctx, next) => {
    if (!ctx.session) ctx.session = {};
    await next();
  });

  initializeHandlers(bot);

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    // Не отправляем ошибку юзеру в продакшене, только в консоль
  });

  return bot;
}

export async function startBot(token: string, webhookUrl?: string): Promise<Telegraf<BotContext>> {
  const botInstance = initializeBot(token);

  // Инициализируем игры в БД при старте
  await initializeDefaultGames(); // <--- Добавили вызов

  if (webhookUrl) {
    await botInstance.telegram.setWebhook(webhookUrl);
    console.log(`[Bot] Webhook set to: ${webhookUrl}`);
  } else {
    botInstance.launch(() => console.log('[Bot] Polling started'));
  }

  return botInstance;
}

export function getBot() { return bot; }
export async function stopBot() { if (bot) bot.stop(); bot = null; }
