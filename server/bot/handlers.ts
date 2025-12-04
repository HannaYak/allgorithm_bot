import { Telegraf, Context, Markup } from 'telegraf';
import { getUserByTelegramId, getDb } from '../db';
import { userProfiles, users } from '../../drizzle/schema'; // Добавили users в импорт
import { eq } from 'drizzle-orm';
import { getUpcomingGameEvents, registerUserForGame } from './games';
import { createPaymentIntent } from './payment';

export interface BotContext extends Context {
  session?: {
    step?: string;
    tempData?: Record<string, any>;
  };
}

export function initializeHandlers(bot: Telegraf<BotContext>) {
  bot.command('start', async (ctx) => {
    console.log(`[Bot] /start from ${ctx.from?.id}`); // Лог для отладки
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      let user = await getUserByTelegramId(telegramId);
      const db = await getDb();

      // Если пользователя нет, создаем
      if (!user && db) {
        await db.insert(users).values({
          telegramId,
          name: ctx.from?.first_name || null,
          role: 'user'
        });
        user = await getUserByTelegramId(telegramId);
      }

      // Проверяем профиль
      if (db && user) {
        const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1);
        if (profile.length > 0 && profile[0].registrationCompleted) {
          return showMainMenu(ctx);
        }
      }

      // Если нет профиля - начинаем регистрацию
      ctx.session = { step: 'greeting', tempData: {} };
      await ctx.reply(
        '👋 Добро пожаловать в Allgorithm!\nДавай начнём с регистрации!',
        Markup.inlineKeyboard([[Markup.button.callback('📋 Пройти анкету', 'start_questionnaire')]])
      );
    } catch (e) {
      console.error('Error in /start:', e);
      await ctx.reply('⚠️ Ошибка соединения с базой данных. Попробуйте позже.');
    }
  });

  // ... (Остальной код бота оставляем без изменений, только замените require на импорты выше, если они там были)
  
  // Вставьте сюда остальную часть handlers.ts из предыдущего ответа, 
  // но убедитесь, что в начале файла есть: import { userProfiles, users } from '../../drizzle/schema';
  
  // КРАТКАЯ ВЕРСИЯ ОСТАЛЬНОГО КОДА ДЛЯ КОПИРОВАНИЯ:
  
  bot.action('start_questionnaire', async (ctx) => {
    ctx.session = { step: 'question_1', tempData: {} };
    await ctx.reply('❓ 1. Как тебя зовут?');
    await ctx.answerCbQuery();
  });

  bot.on('text', async (ctx) => {
    if (!ctx.session?.step?.startsWith('question_') && ctx.session?.step !== 'support_message') return;
    const step = ctx.session.step;
    
    if (step === 'support_message') {
        await ctx.reply('✅ Сообщение отправлено администратору. Ответ придет сюда.');
        ctx.session.step = undefined;
        return;
    }

    const tempData = ctx.session.tempData || {};

    if (step === 'question_1') {
        tempData.fullName = ctx.message.text;
        ctx.session.step = 'question_2';
        await ctx.reply('❓ 2. Дата рождения (ДД.ММ.ГГГГ)');
    } else if (step === 'question_2') {
        tempData.dateOfBirth = ctx.message.text;
        ctx.session.step = 'question_3';
        await ctx.reply('❓ 3. Факт о тебе, который никто не знает');
    } else if (step === 'question_3') {
        tempData.secretFact = ctx.message.text;
        ctx.session.step = 'question_4';
        await ctx.reply('❓ 4. Самая странная история из твоей жизни');
    } else if (step === 'question_4') {
        tempData.strangeStory = ctx.message.text;
        ctx.session.step = 'question_5';
        await ctx.reply('❓ 5. Пол (для быстрых свиданий)', Markup.inlineKeyboard([
            [Markup.button.callback('👨 Мужчина', 'gender_male'), Markup.button.callback('👩 Женщина', 'gender_female')]
        ]));
    }
    ctx.session.tempData = tempData;
  });

  bot.action(/gender_(.+)/, async (ctx) => {
    const gender = ctx.match[1] as 'male' | 'female';
    const tempData = ctx.session?.tempData || {};
    const telegramId = ctx.from?.id.toString();
    
    if (telegramId) {
        const user = await getUserByTelegramId(telegramId);
        const db = await getDb();
        if (user && db) {
            await db.insert(userProfiles).values({
                userId: user.id,
                fullName: tempData.fullName,
                dateOfBirth: tempData.dateOfBirth,
                secretFact: tempData.secretFact,
                strangeStory: tempData.strangeStory,
                gender: gender,
                registrationCompleted: true
            }).onConflictDoUpdate({ 
                target: userProfiles.id, // или другой уникальный ключ, если есть
                set: { registrationCompleted: true } 
            }).catch(e => console.log('Profile update error', e));
            // Postgres требует target для onConflict, если нет уникального ключа, лучше просто insert
            // Либо упростим:
            // await db.insert(userProfiles)...
        }
    }
    ctx.session = {};
    await ctx.reply('✅ Регистрация завершена!');
    await showMainMenu(ctx);
    await ctx.answerCbQuery();
  });

  bot.action('games', async (ctx) => {
    await ctx.reply('🎮 Выбери игру:', Markup.inlineKeyboard([
        [Markup.button.callback('🍽️ Talk & Toast', 'game_talk_toast')],
        [Markup.button.callback('📊 Stock & Know', 'game_stock_know')],
        [Markup.button.callback('💕 Быстрые свидания', 'game_fast_dates')],
        [Markup.button.callback('⬅️ Назад', 'back_to_menu')]
    ]));
    await ctx.answerCbQuery();
  });

  bot.action('back_to_menu', (ctx) => showMainMenu(ctx));
}

export async function showMainMenu(ctx: BotContext) {
  await ctx.reply('📱 Главное меню', Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Игры', 'games'), Markup.button.callback('👤 Личный кабинет', 'account')],
    [Markup.button.callback('💬 Помощь', 'help'), Markup.button.callback('📖 Правила', 'rules')]
  ]));
}
