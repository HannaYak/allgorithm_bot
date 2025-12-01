import { Telegraf } from 'telegraf';
import { getDb, getUserById, getUserByTelegramId } from '../db';
import { 
  supportTickets, 
  supportMessages,
  InsertSupportTicket,
  InsertSupportMessage
} from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { BotContext } from './handlers';

/**
 * Create a new support ticket for a user
 */
export async function createSupportTicket(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(supportTickets).values({
      userId,
      status: 'open',
    });

    // Get the inserted ticket ID
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .limit(1);

    return tickets.length > 0 ? tickets[0].id : null;
  } catch (error) {
    console.error('[Support] Error creating ticket:', error);
    return null;
  }
}

/**
 * Add a message to a support ticket
 */
export async function addSupportMessage(
  ticketId: number,
  userId: number | null,
  message: string,
  isAdminMessage: boolean = false
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.insert(supportMessages).values({
      ticketId,
      userId,
      message,
      isAdminMessage,
    });

    return true;
  } catch (error) {
    console.error('[Support] Error adding message:', error);
    return false;
  }
}

/**
 * Get support ticket messages
 */
export async function getSupportTicketMessages(ticketId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, ticketId));
  } catch (error) {
    console.error('[Support] Error fetching messages:', error);
    return [];
  }
}

/**
 * Get user's active support ticket
 */
export async function getUserActiveSupportTicket(userId: number) {
  const db = await getDb();
  if (!db) return null;

  try {
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.userId, userId),
          eq(supportTickets.status, 'open')
        )
      )
      .limit(1);

    return tickets.length > 0 ? tickets[0] : null;
  } catch (error) {
    console.error('[Support] Error fetching user ticket:', error);
    return null;
  }
}

/**
 * Close a support ticket
 */
export async function closeSupportTicket(ticketId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(supportTickets)
      .set({ status: 'closed' })
      .where(eq(supportTickets.id, ticketId));

    return true;
  } catch (error) {
    console.error('[Support] Error closing ticket:', error);
    return false;
  }
}

/**
 * Initialize support handlers
 */
export function initializeSupportHandlers(bot: Telegraf<BotContext>) {
  // Handle support messages
  bot.on('text', async (ctx) => {
    if (ctx.session?.step !== 'support_message') {
      return; // Not in support mode
    }

    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }

    // Get or create support ticket
    let ticket = await getUserActiveSupportTicket(user.id);
    if (!ticket) {
      const ticketId = await createSupportTicket(user.id);
      if (!ticketId) {
        await ctx.reply('❌ Ошибка при создании обращения');
        return;
      }
      ticket = { id: ticketId, userId: user.id, status: 'open', createdAt: new Date(), updatedAt: new Date() };
    }

    // Add message to ticket
    const success = await addSupportMessage(
      ticket.id,
      user.id,
      ctx.message.text,
      false
    );

    if (success) {
      await ctx.reply(
        '✅ Твое сообщение отправлено администратору.\n\n' +
        '⏱️ Мы ответим в течение 5–10 минут.\n\n' +
        '📱 Ты можешь продолжить писать сообщения, и они будут добавлены в этот же обращение.'
      );

      // Notify admin (in production, send to admin chat)
      console.log(`[Support] New message from user ${user.id} in ticket ${ticket.id}: ${ctx.message.text}`);

      // Reset session to allow more messages
      ctx.session.step = 'support_message';
    } else {
      await ctx.reply('❌ Ошибка при отправке сообщения. Попробуй позже.');
    }
  });
}

/**
 * Send a message from admin to user
 */
export async function sendAdminReplyToUser(
  bot: Telegraf<BotContext>,
  ticketId: number,
  adminMessage: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Get ticket to find user
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (tickets.length === 0) return false;

    const ticket = tickets[0];
    const user = await getUserById(ticket.userId);
    if (!user) return false;

    // Add admin message to ticket
    const success = await addSupportMessage(
      ticketId,
      null,
      adminMessage,
      true
    );

    if (success) {
      // Send message to user via Telegram
      try {
        await bot.telegram.sendMessage(
          parseInt(user.telegramId),
          `💬 **Ответ от администратора:**\n\n${adminMessage}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[Support] Error sending message to user:', error);
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error('[Support] Error sending admin reply:', error);
    return false;
  }
}
