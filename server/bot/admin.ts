import { Telegraf } from 'telegraf';
import { getDb, getUserById } from '../db';
import { 
  gameEvents, 
  supportTickets, 
  supportMessages,
  userVouchers,
  adminLogs,
  InsertGameEvent
} from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { BotContext } from './handlers';

/**
 * Check if user is admin
 */
export async function isAdmin(userId: number): Promise<boolean> {
  const user = await getUserById(userId);
  return user?.role === 'admin';
}

/**
 * Initialize admin commands
 */
export function initializeAdminHandlers(bot: Telegraf<BotContext>) {
  // Admin panel command
  bot.command('panel', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await getUserById(parseInt(telegramId));
    if (!user || user.role !== 'admin') {
      await ctx.reply('❌ У вас нет доступа к админ-панели.');
      return;
    }

    await ctx.reply('🔧 **Админ-панель**', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить событие', callback_data: 'admin_add_event' }],
          [{ text: '🎮 Сегодняшние игры', callback_data: 'admin_today_games' }],
          [{ text: '🎫 Ваучеры на проверку', callback_data: 'admin_vouchers' }],
          [{ text: '💬 Переписка из Помощь', callback_data: 'admin_support' }],
          [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
        ],
      },
      parse_mode: 'Markdown',
    });
  });

  // Add event handler
  bot.action('admin_add_event', async (ctx) => {
    ctx.session = { step: 'admin_add_event_type' };
    await ctx.reply('Выбери тип игры:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍽️ Talk & Toast', callback_data: 'add_event_talk_toast' }],
          [{ text: '📊 Stock & Know', callback_data: 'add_event_stock_know' }],
          [{ text: '💕 Быстрые свидания', callback_data: 'add_event_fast_dates' }],
        ],
      },
    });
    await ctx.answerCbQuery();
  });

  // Today's games handler
  bot.action('admin_today_games', async (ctx) => {
    const db = await getDb();
    if (!db) {
      await ctx.reply('❌ Ошибка базы данных');
      await ctx.answerCbQuery();
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayEvents = await db
        .select()
        .from(gameEvents)
        .where(
          and(
            eq(gameEvents.status, 'scheduled')
            // Add date filtering if needed
          )
        );

      if (todayEvents.length === 0) {
        await ctx.reply('📭 Нет игр на сегодня');
        await ctx.answerCbQuery();
        return;
      }

      let message = '🎮 **Игры на сегодня:**\n\n';
      const buttons = [];

      for (const event of todayEvents) {
        message += `📍 Event ID: ${event.id}\n`;
        message += `👥 Участников: ${event.currentParticipants}/${event.maxParticipants}\n`;
        message += `📅 Время: ${event.eventDate}\n\n`;

        buttons.push([
          { text: `Управлять #${event.id}`, callback_data: `admin_manage_event_${event.id}` },
        ]);
      }

      await ctx.reply(message, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('[Admin] Error fetching today games:', error);
      await ctx.reply('❌ Ошибка при получении игр');
    }

    await ctx.answerCbQuery();
  });

  // Vouchers verification handler
  bot.action('admin_vouchers', async (ctx) => {
    const db = await getDb();
    if (!db) {
      await ctx.reply('❌ Ошибка базы данных');
      await ctx.answerCbQuery();
      return;
    }

    try {
      const pendingVouchers = await db
        .select()
        .from(userVouchers)
        .where(eq(userVouchers.status, 'pending'));

      if (pendingVouchers.length === 0) {
        await ctx.reply('✅ Нет ваучеров на проверку');
        await ctx.answerCbQuery();
        return;
      }

      let message = '🎫 **Ваучеры на проверку:**\n\n';
      const buttons = [];

      for (const voucher of pendingVouchers) {
        message += `Ваучер ID: ${voucher.id}\n`;
        message += `Код: ${voucher.voucherCode}\n`;
        message += `Пользователь ID: ${voucher.userId}\n\n`;

        buttons.push([
          { text: `✅ Одобрить #${voucher.id}`, callback_data: `approve_voucher_${voucher.id}` },
          { text: `❌ Отклонить #${voucher.id}`, callback_data: `reject_voucher_${voucher.id}` },
        ]);
      }

      await ctx.reply(message, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('[Admin] Error fetching vouchers:', error);
      await ctx.reply('❌ Ошибка при получении ваучеров');
    }

    await ctx.answerCbQuery();
  });

  // Support tickets handler
  bot.action('admin_support', async (ctx) => {
    const db = await getDb();
    if (!db) {
      await ctx.reply('❌ Ошибка базы данных');
      await ctx.answerCbQuery();
      return;
    }

    try {
      const openTickets = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.status, 'open'));

      if (openTickets.length === 0) {
        await ctx.reply('✅ Нет открытых обращений');
        await ctx.answerCbQuery();
        return;
      }

      let message = '💬 **Открытые обращения:**\n\n';
      const buttons = [];

      for (const ticket of openTickets) {
        message += `Ticket ID: ${ticket.id}\n`;
        message += `Пользователь ID: ${ticket.userId}\n`;
        message += `Создано: ${ticket.createdAt}\n\n`;

        buttons.push([
          { text: `Открыть #${ticket.id}`, callback_data: `admin_open_ticket_${ticket.id}` },
        ]);
      }

      await ctx.reply(message, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('[Admin] Error fetching support tickets:', error);
      await ctx.reply('❌ Ошибка при получении обращений');
    }

    await ctx.answerCbQuery();
  });

  // Statistics handler
  bot.action('admin_stats', async (ctx) => {
    await ctx.reply(
      '📊 **Статистика**\n\n' +
      '<!-- PLACEHOLDER: Добавь статистику здесь -->\n' +
      'Статистика будет добавлена позже.',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
  });

  // Voucher approval
  bot.action(/approve_voucher_(\d+)/, async (ctx) => {
    const voucherId = parseInt(ctx.match[1]);
    const db = await getDb();
    if (!db) {
      await ctx.reply('❌ Ошибка базы данных');
      await ctx.answerCbQuery();
      return;
    }

    try {
      await db
        .update(userVouchers)
        .set({ status: 'approved' })
        .where(eq(userVouchers.id, voucherId));

      await ctx.reply(`✅ Ваучер #${voucherId} одобрен`);
    } catch (error) {
      console.error('[Admin] Error approving voucher:', error);
      await ctx.reply('❌ Ошибка при одобрении ваучера');
    }

    await ctx.answerCbQuery();
  });

  // Voucher rejection
  bot.action(/reject_voucher_(\d+)/, async (ctx) => {
    const voucherId = parseInt(ctx.match[1]);
    const db = await getDb();
    if (!db) {
      await ctx.reply('❌ Ошибка базы данных');
      await ctx.answerCbQuery();
      return;
    }

    try {
      await db
        .update(userVouchers)
        .set({ status: 'rejected' })
        .where(eq(userVouchers.id, voucherId));

      await ctx.reply(`❌ Ваучер #${voucherId} отклонен`);
    } catch (error) {
      console.error('[Admin] Error rejecting voucher:', error);
      await ctx.reply('❌ Ошибка при отклонении ваучера');
    }

    await ctx.answerCbQuery();
  });
}

/**
 * Log admin action
 */
export async function logAdminAction(
  adminId: number,
  action: string,
  details?: string
) {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(adminLogs).values({
      adminId,
      action,
      details,
    });
  } catch (error) {
    console.error('[Admin] Error logging action:', error);
  }
}
