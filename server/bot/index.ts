import { Telegraf } from 'telegraf';
import { initializeHandlers, BotContext } from './handlers';

let bot: Telegraf<BotContext> | null = null;

/**
 * Initialize the Telegram bot
 */
export function initializeBot(token: string): Telegraf<BotContext> {
  if (bot) {
    return bot;
  }

  bot = new Telegraf<BotContext>(token);

  // Middleware for session management
  bot.use(async (ctx, next) => {
    if (!ctx.session) {
      ctx.session = {};
    }
    await next();
  });

  // Initialize all handlers
  initializeHandlers(bot);

  // Error handling
  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуй позже.').catch(console.error);
  });

  return bot;
}

/**
 * Start the bot with webhook or polling
 */
export async function startBot(
  token: string,
  webhookUrl?: string
): Promise<Telegraf<BotContext>> {
  const botInstance = initializeBot(token);

  if (webhookUrl) {
    // Use webhook for production
    await botInstance.telegram.setWebhook(webhookUrl);
    console.log(`[Bot] Webhook set to: ${webhookUrl}`);
  } else {
    // Use polling for development
    await botInstance.launch();
    console.log('[Bot] Polling started');
  }

  return botInstance;
}

/**
 * Get the bot instance
 */
export function getBot(): Telegraf<BotContext> | null {
  return bot;
}

/**
 * Stop the bot
 */
export async function stopBot(): Promise<void> {
  if (bot) {
    try {
      await bot.stop();
    } catch (error) {
      console.error('[Bot] Error stopping bot:', error);
    }
    bot = null;
    console.log('[Bot] Bot stopped');
  }
}
