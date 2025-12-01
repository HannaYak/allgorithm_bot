import { Telegraf, Context } from 'telegraf';
import { getUserByTelegramId, getDb } from '../db';
import { userProfiles } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

export interface BotContext extends Context {
  session?: {
    step?: string;
    tempData?: Record<string, any>;
  };
}

/**
 * Initialize all bot handlers
 */
export function initializeHandlers(bot: Telegraf<BotContext>) {
  // Start command - greeting and questionnaire
  bot.command('start', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    let user = await getUserByTelegramId(telegramId);

    // If user doesn't exist, create them
    if (!user) {
      const db = await getDb();
      if (db) {
        await db.insert(require('../../drizzle/schema').users).values({
          telegramId,
          name: ctx.from?.first_name || null,
          email: null,
        });
        user = await getUserByTelegramId(telegramId);
      }
    }

    // Check if user has completed registration
    const db = await getDb();
    if (db) {
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, user?.id || 0))
        .limit(1);

      if (profile.length > 0 && profile[0].registrationCompleted) {
        // User already registered, show main menu
        await showMainMenu(ctx);
        return;
      }
    }

    // Start registration flow
    ctx.session = { step: 'greeting', tempData: {} };
    await ctx.reply(
      '👋 Добро пожаловать в Allgorithm!\n\n' +
      'Это приложение для организации интересных встреч и игр.\n\n' +
      'Давайте начнём с регистрации!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Пройти анкету', callback_data: 'start_questionnaire' }],
          ],
        },
      }
    );
  });

  // Questionnaire start
  bot.action('start_questionnaire', async (ctx) => {
    ctx.session = { step: 'question_1', tempData: {} };
    await ctx.reply('❓ Вопрос 1: Как тебя зовут?');
    await ctx.answerCbQuery();
  });

  // Handle text responses for questionnaire
  bot.on('text', async (ctx) => {
    if (!ctx.session?.step?.startsWith('question_')) {
      return; // Not in questionnaire mode
    }

    const step = ctx.session.step;
    const tempData = ctx.session.tempData || {};

    switch (step) {
      case 'question_1':
        tempData.fullName = ctx.message.text;
        ctx.session.step = 'question_2';
        await ctx.reply('❓ Вопрос 2: Дата рождения (ДД.ММ.ГГГГ)');
        break;

      case 'question_2':
        // Validate date format
        if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
          await ctx.reply('❌ Пожалуйста, введи дату в формате ДД.ММ.ГГГГ');
          return;
        }
        tempData.dateOfBirth = ctx.message.text;
        ctx.session.step = 'question_3';
        await ctx.reply('❓ Вопрос 3: Факт о тебе, который никто не знает');
        break;

      case 'question_3':
        tempData.secretFact = ctx.message.text;
        ctx.session.step = 'question_4';
        await ctx.reply('❓ Вопрос 4: Самая странная история из твоей жизни');
        break;

      case 'question_4':
        tempData.strangeStory = ctx.message.text;
        ctx.session.step = 'question_5';
        await ctx.reply('❓ Вопрос 5: Твой пол (для быстрых свиданий)', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '👨 Мужчина', callback_data: 'gender_male' },
                { text: '👩 Женщина', callback_data: 'gender_female' },
              ],
            ],
          },
        });
        break;
    }

    ctx.session.tempData = tempData;
  });

  // Gender selection
  bot.action(/gender_(.+)/, async (ctx) => {
    const gender = ctx.match[1];
    const tempData = ctx.session?.tempData || {};
    tempData.gender = gender;

    // Save profile to database
    const telegramId = ctx.from?.id.toString();
    if (telegramId) {
      const user = await getUserByTelegramId(telegramId);
      if (user) {
        const db = await getDb();
        if (db) {
          // Check if profile exists
          const existingProfile = await db
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.userId, user.id))
            .limit(1);

          if (existingProfile.length > 0) {
            // Update existing profile
            await db
              .update(userProfiles)
              .set({
                fullName: tempData.fullName,
                dateOfBirth: tempData.dateOfBirth,
                secretFact: tempData.secretFact,
                strangeStory: tempData.strangeStory,
                gender: tempData.gender,
                registrationCompleted: true,
              })
              .where(eq(userProfiles.userId, user.id));
          } else {
            // Create new profile
            await db.insert(userProfiles).values({
              userId: user.id,
              fullName: tempData.fullName,
              dateOfBirth: tempData.dateOfBirth,
              secretFact: tempData.secretFact,
              strangeStory: tempData.strangeStory,
              gender: tempData.gender,
              registrationCompleted: true,
            });
          }
        }
      }
    }

    ctx.session = {};
    await ctx.reply('✅ Спасибо! Регистрация завершена.\n\nДобро пожаловать в Allgorithm!');
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
  });

  // Main menu buttons
  bot.action('games', async (ctx) => {
    await ctx.reply('🎮 Выбери игру:\n\n1. Talk & Toast\n2. Stock & Know\n3. Быстрые свидания', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🍽️ Talk & Toast', callback_data: 'game_talk_toast' }],
          [{ text: '📊 Stock & Know', callback_data: 'game_stock_know' }],
          [{ text: '💕 Быстрые свидания', callback_data: 'game_fast_dates' }],
          [{ text: '⬅️ Назад', callback_data: 'back_to_menu' }],
        ],
      },
    });
    await ctx.answerCbQuery();
  });

  bot.action('account', async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }

    const db = await getDb();
    if (!db) {
      await ctx.reply('❌ Ошибка базы данных');
      return;
    }

    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1);

    let accountInfo = '👤 **Личный кабинет**\n\n';
    if (profile.length > 0) {
      const p = profile[0];
      accountInfo += `📝 Имя: ${p.fullName}\n`;
      accountInfo += `🎂 Дата рождения: ${p.dateOfBirth}\n`;
      accountInfo += `👥 Пол: ${p.gender === 'male' ? 'Мужчина' : 'Женщина'}\n\n`;
    }

    await ctx.reply(accountInfo, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Мои игры', callback_data: 'my_games' }],
          [{ text: '📊 Мои данные', callback_data: 'my_data' }],
          [{ text: '🎁 Ваучеры', callback_data: 'my_vouchers' }],
          [{ text: '⬅️ Назад', callback_data: 'back_to_menu' }],
        ],
      },
      parse_mode: 'Markdown',
    });
    await ctx.answerCbQuery();
  });

  bot.action('help', async (ctx) => {
    ctx.session = { step: 'support_message' };
    await ctx.reply(
      '💬 Напиши свой вопрос, и администратор ответит в течение 5–10 минут.\n\n' +
      'Отправь сообщение ниже:'
    );
    await ctx.answerCbQuery();
  });

  bot.action('rules', async (ctx) => {
    await ctx.reply(
      '📖 **Правила Allgorithm**\n\n' +
      '<!-- PLACEHOLDER: Добавь правила здесь -->\n' +
      'Правила будут добавлены администратором.',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
  });

  bot.action('back_to_menu', async (ctx) => {
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
  });
}

/**
 * Show main menu with persistent keyboard
 */
export async function showMainMenu(ctx: BotContext) {
  await ctx.reply('📱 **Главное меню**', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎮 Игры', callback_data: 'games' },
          { text: '👤 Личный кабинет', callback_data: 'account' },
        ],
        [
          { text: '💬 Помощь', callback_data: 'help' },
          { text: '📖 Правила', callback_data: 'rules' },
        ],
      ],
    },
    parse_mode: 'Markdown',
  });
}
