import { Telegraf, Markup, session, Scenes } from 'telegraf';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema'; 
import 'dotenv/config';
import Stripe from 'stripe';
import { DateTime } from 'luxon'; // Нужен для работы со временем

// --- 1. НАСТРОЙКИ ---

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is missing');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// Цены (Проверь в Stripe!)
const GAME_PRICES: Record<string, string> = {
  'talk_toast': 'price_1SUTjrHhXyjuCWwfhQ7zwxLQ', 
  'stock_know': 'price_1SUTkoHhXyjuCWwfxD89YIpP',
  'speed_dating': 'price_1SUTlVHhXyjuCWwfU1IzNMlf',
};
const STRIPE_COUPON_ID = '8RiQPzVX'; 
const ADMIN_ID = 5456905649; 

// Защита от повторного запуска авто-событий (храним ID запущенных викторин)
const PROCESSED_AUTO_ACTIONS = new Set<string>(); 

// --- 2. ВОПРОСЫ И ТЕМЫ ---

const CONVERSATION_TOPICS = [
  "🎬 Какой фильм ты можешь пересматривать бесконечно?",
  "✈️ В какую страну ты бы поехал прямо сейчас?",
  "🍕 Твое любимое блюдо?",
  "🦸‍♂️ Какую суперспособность ты бы выбрал?",
  "🎵 Песня, которая заставляет танцевать?",
  "📚 Книга, которую советуешь всем?",
  "💼 Кем хотел стать в детстве?",
  "🎁 Лучший подарок в твоей жизни?",
];

const STOCK_QUESTIONS = [
  { q: "Сколько славянских народов выделяют в этнологии?", h1: "Число городов-героев.", h2: "Число лунных циклов в году.", h3: "Пятница 13.", a: "13" },
  { q: "Количество 'Новых чудес света'.", h1: "Звезды в ковше Медведицы.", h2: "Рождество (январь).", h3: "Футов под килем.", a: "7" },
  { q: "Сколько основных видов чая по ферментации?", h1: "Игроков в волейболе.", h2: "Ног у насекомых.", h3: "Граней у куба.", a: "6" }
];

// --- 3. СОСТОЯНИЕ (STATE) ---

const FAST_DATES_STATE = {
    eventId: 0, round: 0, votes: new Map<number, number[]>(),
    participants: new Map<number, { id: number, name: string, username: string, num: number, gender: string }>(),
    men: [] as number[], women: [] as number[], adminInputTargetId: 0 
};

const STOCK_STATE = { isActive: false, currentQuestionId: 0 };
const TALK_STATE = { currentFact: '', currentUser: '', isActive: false };

// --- 4. ИНИЦИАЛИЗАЦИЯ БОТА ---

const bot = new Telegraf<any>(process.env.TELEGRAM_BOT_TOKEN || '');
const stage = new Scenes.Stage([]); 
bot.use(session());
bot.use(stage.middleware());

// --- 5. АВТОПИЛОТ (ТАЙМЕР) ---
// Проверяет расписание каждую минуту
setInterval(async () => {
    try {
        // Получаем текущее время (серверное)
        // Важно: Убедитесь, что при добавлении игры вы учитываете часовой пояс сервера (обычно UTC)
        const now = DateTime.now(); 

        // Ищем все активные игры
        const activeEvents = await db.query.events.findMany({
            where: eq(schema.events.isActive, true)
        });

        for (const event of activeEvents) {
            // Парсим дату игры (Формат: ДД.ММ.ГГГГ ЧЧ:ММ)
            const start = DateTime.fromFormat(event.dateString, "dd.MM.yyyy HH:mm");
            
            if (!start.isValid) continue;

            // 1. АВТО-ВИКТОРИНА для Talk & Toast (за 15 мин до конца)
            // Игра идет 2 часа (120 мин). Викторина начинается на 105-й минуте.
            const quizTime = start.plus({ minutes: 105 }); 
            const endOfGame = start.plus({ minutes: 120 });

            // Если тип игры Talk&Toast И наступило время викторины И еще не закончилась И мы еще не запускали
            if (event.type === 'talk_toast' && now >= quizTime && now < endOfGame) {
                const actionId = `quiz_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    console.log(`🚀 Запуск авто-викторины для игры ${event.id}`);
                    runAutoQuiz(event.id); // <-- ЗАПУСК
                }
            }

            // 2. АВТО-ЗАВЕРШЕНИЕ (Для всех игр через 2 часа)
            // Даем небольшой буфер (например, закрываем через 2 часа 10 мин)
            const closeTime = start.plus({ minutes: 130 });
            if (now >= closeTime) {
                const actionId = `close_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    console.log(`🏁 Авто-завершение игры ${event.id}`);
                    autoCloseEvent(event.id); // <-- ЗАПУСК
                }
            }
        }
    } catch (e) {
        console.error("Autopilot Error:", e);
    }
}, 60000); // Проверка каждую минуту (60000 мс)

// Функция Авто-Викторины (Без админа)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runAutoQuiz(eventId: number) {
    // 1. Берем участников
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
    if (bookings.length < 2) return; // Мало людей - не проводим

    // 2. Объявляем начало
    await broadcastToEvent(eventId, `🔔 <b>Осталось 15 минут!</b>\n\nДавайте поиграем! Бот будет присылать факты об участниках, а вы угадывайте, о ком это. 🧐`);
    await delay(5000);

    // 3. Выбираем 3 случайных факта
    const shuffled = bookings.sort(() => 0.5 - Math.random()).slice(0, 3);

    for (const booking of shuffled) {
        const user = await db.query.users.findFirst({ where: eq(schema.users.id, booking.userId) });
        if (!user) continue;
        const fact = (user.fact && user.fact.length > 2) ? user.fact : user.strangeStory;
        if (!fact) continue;

        // Вопрос
        await broadcastToEvent(eventId, `❓ <b>Чей это факт?</b>\n\n"${fact}"\n\n<i>(У вас 30 секунд на обсуждение...)</i>`);
        
        // Ждем 30 секунд
        await delay(30000);

        // Ответ
        await broadcastToEvent(eventId, `🔓 <b>Это был(а):</b> ${user.name}! 🎉`);
        
        // Пауза перед следующим
        await delay(5000);
    }

    await broadcastToEvent(eventId, `🏁 <b>Викторина окончена!</b>\nСпасибо за прекрасный вечер. До скорых встреч! 👋`);
}

// Функция Авто-Завершения
async function autoCloseEvent(eventId: number) {
    // 1. Закрываем
    await db.update(schema.events).set({ isActive: false }).where(eq(schema.events.id, eventId));
    
    // 2. Начисляем баллы
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
    for (const b of bookings) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
        if (u) {
             await db.update(schema.users).set({ gamesPlayed: (u.gamesPlayed||0)+1 }).where(eq(schema.users.id, u.id));
             // Можно отправить уведомление
             // bot.telegram.sendMessage(u.telegramId, '🎁 Вам начислен балл лояльности за прошедшую игру!').catch(()=>{});
        }
    }
}

// Помощник для рассылки по ID события
async function broadcastToEvent(eventId: number, text: string) {
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
    for (const b of bookings) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
        if (u) bot.telegram.sendMessage(u.telegramId, text, { parse_mode: 'HTML' }).catch(()=>{});
    }
}

// --- 6. СЦЕНЫ И МЕНЮ (СТАНДАРТ) ---

const registerScene = new Scenes.WizardScene('REGISTER_SCENE',
  async (ctx) => { ctx.reply('👋 Добро пожаловать в Allgorithm! Давай начнем с регистрации.\n\n1. Как тебя зовут?'); return ctx.wizard.next(); },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.name = ctx.message.text; 
      ctx.reply('2. Твоя дата рождения? (ДД.ММ.ГГГГ)'); return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.birthDate = ctx.message.text; 
      ctx.reply('3. Напиши факт о себе, который никто не знает:'); return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.fact = ctx.message.text; 
      ctx.reply('4. Самая странная история из твоей жизни:'); return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.story = ctx.message.text; 
      ctx.reply('5. Твой пол (для быстрых свиданий):', Markup.keyboard([['Мужчина', 'Женщина']]).oneTime().resize()); return ctx.wizard.next(); 
  },
  async (ctx) => {
    // @ts-ignore
    const gender = ctx.message.text;
    // @ts-ignore
    const data = ctx.wizard.state;
    await db.insert(schema.users).values({
      telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name,
      name: data.name, birthDate: data.birthDate, fact: data.fact, strangeStory: data.story, gender: gender, isAdmin: ctx.from.id === ADMIN_ID 
    });
    ctx.reply('✅ Регистрация завершена! Добро пожаловать.', getMainKeyboard());
    return ctx.scene.leave();
  }
);
stage.register(registerScene);

function getMainKeyboard() {
  return Markup.keyboard([['🎮 Игры', '👤 Личный кабинет'], ['🆘 Помощь', '📜 Правила']]).resize();
}

bot.start(async (ctx) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
  if (!user) ctx.scene.enter('REGISTER_SCENE');
  else ctx.reply(`С возвращением, ${user.name}!`, getMainKeyboard());
});

bot.hears('🎮 Игры', (ctx) => {
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([
    [Markup.button.callback('Talk & Toast 🥂', 'game_talk')],
    [Markup.button.callback('Stock & Know 🧠', 'game_stock')],
    [Markup.button.callback('Быстрые свидания 💘', 'game_dating')]
  ]));
});

bot.hears('👤 Личный кабинет', async (ctx) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
  if (!user) return ctx.reply('Пройдите регистрацию /start');
  const gamesLeft = 5 - (user.gamesPlayed % 5);
  ctx.reply(
    `👤 *Личный кабинет*\n\n👤 Имя: ${user.name}\n🎂 ДР: ${user.birthDate}\n🎲 Игр сыграно: ${user.gamesPlayed}\n🎁 До бесплатной игры: ${gamesLeft}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Мои билеты', 'my_games')], [Markup.button.callback('🎟 У меня есть ваучер', 'upload_voucher')]]) }
  );
});

bot.hears('📜 Правила', (ctx) => ctx.reply('📜 Правила: Уважение, Оплата заранее, Не опаздывать.'));
bot.hears('🆘 Помощь', (ctx) => {
    ctx.reply('Напиши свой вопрос следующим сообщением.');
    // @ts-ignore
    ctx.session = { waitingForSupport: true };
});

// --- 7. ЛОГИКА ИГР (РУЧНАЯ) ---

bot.action('game_talk', (ctx) => {
  ctx.editMessageText('🥂 *Talk & Toast*\nУжин, общение, викторина.\nМакс: 7', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Записаться', 'book_talk')], [Markup.button.callback('🎲 Дай тему', 'get_random_topic')], [Markup.button.callback('🔙 Назад', 'back_to_games')]]) });
});
bot.action('get_random_topic', async (ctx) => {
  const topic = CONVERSATION_TOPICS[Math.floor(Math.random() * CONVERSATION_TOPICS.length)];
  await ctx.reply(`🎲 *Тема:* "${topic}"`, { parse_mode: 'Markdown' });
  await ctx.answerCbQuery(); 
});
bot.action('book_talk', async (ctx) => bookGame(ctx, 'talk_toast'));

bot.action('game_stock', (ctx) => {
  ctx.editMessageText('🧠 *Stock & Know*\nИнтеллектуальная биржа.\nМакс: 8', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Записаться', 'book_stock')], [Markup.button.callback('🔙 Назад', 'back_to_games')]]) });
});
bot.action('book_stock', async (ctx) => bookGame(ctx, 'stock_know'));

bot.action('game_dating', (ctx) => {
  ctx.editMessageText('💘 *Быстрые свидания*\n7 минут на знакомство.\nМакс: 14', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Записаться', 'book_dating')], [Markup.button.callback('🔙 Назад', 'back_to_games')]]) });
});
bot.action('book_dating', async (ctx) => bookGame(ctx, 'speed_dating'));

async function bookGame(ctx: any, type: string) {
  const events = await db.query.events.findMany({ where: (e, { eq, and }) => and(eq(e.type, type), eq(e.isActive, true)) });
  if (events.length === 0) return ctx.reply('Игр пока нет 😔');
  const buttons = events.map(e => [Markup.button.callback(`${e.dateString} (${e.currentPlayers}/${e.maxPlayers})`, `pay_event_${e.id}`)]);
  buttons.push([Markup.button.callback('🔙 Назад', 'back_to_games')]);
  ctx.reply('Выберите дату:', Markup.inlineKeyboard(buttons));
}

bot.action('back_to_games', (ctx) => {
  ctx.deleteMessage();
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([[Markup.button.callback('Talk & Toast 🥂', 'game_talk')], [Markup.button.callback('Stock & Know 🧠', 'game_stock')], [Markup.button.callback('Быстрые свидания 💘', 'game_dating')]]));
});

bot.action('my_games', async (ctx) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
    if (!user) return;
    const myBookings = await db.select({ t: schema.events.type, d: schema.events.dateString, desc: schema.events.description }).from(schema.bookings).innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id)).where((b, { and, eq }) => and(eq(b.userId, user.id), eq(b.paid, true), eq(schema.events.isActive, true)));
    if (myBookings.length === 0) return ctx.reply('📭 У вас нет активных записей.');
    let msg = '📅 <b>Ваши билеты:</b>\n\n';
    myBookings.forEach(b => msg += `🗓 <b>${b.d}</b> | ${b.t}\n📍 ${b.desc}\n\n`);
    ctx.reply(msg, { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

// --- 8. ОПЛАТА И СКИДКИ ---

bot.action(/pay_event_(\d+)/, async (ctx) => {
  const eventId = parseInt(ctx.match[1]);
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, telegramId) });
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
    if (!user || !event) return ctx.reply('Ошибка данных.');

    const priceId = GAME_PRICES[event.type];
    if (!priceId) return ctx.reply('Ошибка: цена не настроена.');

    const activeVoucher = await db.query.vouchers.findFirst({ where: (v, { and, eq }) => and(eq(v.userId, user.id), eq(v.status, 'approved')) });

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `https://t.me/AllgorithmBot?start=success`,
      cancel_url: `https://t.me/AllgorithmBot?start=cancel`,
      metadata: { telegramId: telegramId.toString(), eventId: eventId.toString(), voucherId: activeVoucher ? activeVoucher.id.toString() : '' },
    };

    if (activeVoucher) sessionConfig.discounts = [{ coupon: STRIPE_COUPON_ID }];

    const session = await stripe.checkout.sessions.create(sessionConfig);
    if (!session.url) throw new Error('No URL');

    const msg = activeVoucher ? `🎉 <b>Ваучер применен!</b> Скидка 10 PLN.` : `Оплата участия: 50 PLN`;
    ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('💸 Оплатить', session.url)], [Markup.button.callback('✅ Я оплатил', `confirm_pay_${eventId}`)]]) });
  } catch (e) {
    console.error(e);
    const err = e instanceof Error ? e.message : String(e);
    ctx.reply(`Ошибка Stripe: ${err}`);
  }
});

bot.action(/confirm_pay_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
        const sessions = await stripe.checkout.sessions.list({ limit: 10 });
        const paidSession = sessions.data.find(s => s.metadata?.telegramId === telegramId && s.metadata?.eventId === eventId.toString() && s.payment_status === 'paid');

        if (!paidSession) return ctx.reply('🔍 Оплата не найдена. Подождите 10 сек.');

        const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from!.id)});
        if (!user) return;

        const booking = await db.query.bookings.findFirst({ where: (b, { and, eq }) => and(eq(b.userId, user.id), eq(b.eventId, eventId)) });
        if (booking) return ctx.reply('✅ Вы уже записаны!');

        if (paidSession.metadata?.voucherId) {
            await db.update(schema.vouchers).set({ status: 'used' }).where(eq(schema.vouchers.id, parseInt(paidSession.metadata.voucherId)));
        }

        await db.insert(schema.bookings).values({ userId: user.id, eventId: eventId, paid: true });
        const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
        if (event) await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eventId));

        ctx.editMessageText('🎉 Оплата подтверждена! Вы в игре.');
    } catch (e) { ctx.reply('Ошибка проверки.'); }
});

// --- 9. ВАУЧЕРЫ ---

bot.action('upload_voucher', (ctx) => {
    ctx.reply('📸 Отправьте фото ваучера/чека.');
    // @ts-ignore
    ctx.session = { waitingForVoucher: true };
    ctx.answerCbQuery();
});

bot.on('photo', async (ctx, next) => {
    // @ts-ignore
    if (!ctx.session?.waitingForVoucher) return next();
    
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
    if (user) {
        const [v] = await db.insert(schema.vouchers).values({ userId: user.id, photoFileId: photo.file_id, status: 'pending' }).returning();
        ctx.reply('✅ Отправлено на проверку.');
        // @ts-ignore
        ctx.session.waitingForVoucher = false;
        
        await bot.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
            caption: `🎟 Ваучер от ${user.name}`,
            ...Markup.inlineKeyboard([[Markup.button.callback('✅ Принять', `voucher_approve_${v.id}`), Markup.button.callback('❌ Отклонить', `voucher_reject_${v.id}`)]])
        });
    }
});

bot.action(/voucher_approve_(\d+)/, async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const id = parseInt(ctx.match[1]);
    await db.update(schema.vouchers).set({ status: 'approved' }).where(eq(schema.vouchers.id, id));
    ctx.editMessageCaption('✅ Одобрено.');
    const v = await db.query.vouchers.findFirst({ where: eq(schema.vouchers.id, id) });
    if(v) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, v.userId) });
        if(u) bot.telegram.sendMessage(u.telegramId, '🎉 Ваш ваучер одобрен! Скидка применится автоматически.').catch(()=>{});
    }
});
bot.action(/voucher_reject_(\d+)/, async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const id = parseInt(ctx.match[1]);
    await db.update(schema.vouchers).set({ status: 'rejected' }).where(eq(schema.vouchers.id, id));
    ctx.editMessageCaption('❌ Отклонено.');
});

// --- 10. АДМИН-ПАНЕЛЬ ---

bot.command('panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply('🔒 Админ-панель', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить игру', 'admin_add_event')],
    [Markup.button.callback('🏁 ЗАВЕРШИТЬ ИГРУ', 'admin_close_event')], 
    [Markup.button.callback('📢 Рассылка', 'admin_broadcast_start')],
    [Markup.button.callback('📋 Записи', 'admin_bookings')],
    [Markup.button.callback('💘 Пульт FD', 'admin_fd_panel')],
    [Markup.button.callback('🧠 Пульт Stock', 'admin_stock_list')],
    [Markup.button.callback('🥂 Пульт Talk', 'admin_talk_panel')], // Оставляем на всякий случай
    [Markup.button.callback('📊 Статистика', 'admin_stats')]
  ], { columns: 2 }));
});

// Рассылка
bot.action('admin_broadcast_start', (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    ctx.reply('📢 Введите текст рассылки.');
    // @ts-ignore
    ctx.session = { waitingForBroadcast: true };
    ctx.answerCbQuery();
});

// Статистика
bot.action('admin_stats', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const users = await db.query.users.findMany();
    const paid = await db.query.bookings.findMany({ where: eq(schema.bookings.paid, true) });
    ctx.editMessageText(`📊 Пользователей: ${users.length}\n💰 Билетов: ${paid.length}`, { ...Markup.inlineKeyboard([[Markup.button.callback('🔙', 'panel')]]) });
});

// Завершение игры (ручное)
bot.action('admin_close_event', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const active = await db.query.events.findMany({ where: eq(schema.events.isActive, true) });
    const btns = active.map(e => [Markup.button.callback(`🏁 ${e.dateString} (${e.type})`, `close_confirm_${e.id}`)]);
    ctx.editMessageText('Какую игру закрыть вручную?', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'panel')]]));
});
bot.action(/close_confirm_(\d+)/, async (ctx) => {
    await autoCloseEvent(parseInt(ctx.match[1])); // Используем ту же функцию
    ctx.editMessageText(`✅ Закрыто.`);
});

// Пульт Talk & Toast (Ручной, на всякий случай)
bot.action('admin_talk_panel', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const event = await db.query.events.findFirst({ where: (e, {and, eq}) => and(eq(e.type, 'talk_toast'), eq(e.isActive, true)) });
    if (!event) return ctx.reply('Нет активной игры Talk & Toast.');
    ctx.editMessageText(`🥂 <b>Talk & Toast:</b> ${event.dateString}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('🎲 Случайный факт', `talk_gen_fact_${event.id}`)],
            [Markup.button.callback('🔙', 'panel')]
        ])
    });
});
bot.action(/talk_gen_fact_(\d+)/, async (ctx) => {
    const eid = parseInt(ctx.match[1]);
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eid), eq(b.paid, true)) });
    if (bookings.length === 0) return ctx.reply('Нет участников.');
    const randomBooking = bookings[Math.floor(Math.random() * bookings.length)];
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, randomBooking.userId) });
    if (!user) return;
    const text = (Math.random() > 0.5 ? user.fact : user.strangeStory) || user.fact || '...';
    TALK_STATE.currentFact = text; TALK_STATE.currentUser = user.name || 'Аноним';
    ctx.editMessageText(`📝 "${text}"\n👤 ${user.name}\nОтправить?`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('📢 Загадать', `talk_send_riddle_${eid}`)], [Markup.button.callback('🔄 Другой', `talk_gen_fact_${eid}`)], [Markup.button.callback('🔙', 'admin_talk_panel')]
        ])});
});
bot.action(/talk_send_riddle_(\d+)/, async (ctx) => {
    await broadcastToEvent(parseInt(ctx.match[1]), `🧐 <b>Угадайте, о ком это?</b>\n\n"${TALK_STATE.currentFact}"`);
    ctx.reply('✅ Отправлено. Потом нажми "Раскрыть".', Markup.inlineKeyboard([[Markup.button.callback('🔓 Раскрыть', `talk_reveal_${ctx.match[1]}`)]]));
});
bot.action(/talk_reveal_(\d+)/, async (ctx) => {
    await broadcastToEvent(parseInt(ctx.match[1]), `🔓 <b>Это был(а):</b> ${TALK_STATE.currentUser}! 🎉`);
    ctx.reply('✅ Имя раскрыто.');
});

// Пульт Stock & Know (Ручной)
bot.action('admin_stock_list', (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const btns = STOCK_QUESTIONS.map((_, i) => [Markup.button.callback(`❓ Вопрос ${i+1}`, `stock_manage_${i}`)]);
    ctx.editMessageText('🧠 Выберите вопрос:', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'panel')]]));
});
bot.action(/stock_manage_(\d+)/, (ctx) => {
    const i = parseInt(ctx.match[1]);
    const q = STOCK_QUESTIONS[i];
    STOCK_STATE.currentQuestionId = i;
    const icon = STOCK_STATE.isActive ? '🟢' : '🔴';
    ctx.editMessageText(`❓ ${q.q}\nОтвет: ||${q.a}||\nСтатус: ${icon}`, { parse_mode: 'MarkdownV2', ...Markup.inlineKeyboard([
        [Markup.button.callback(`${icon} Прием ответов`, `stock_toggle_${i}`)],
        [Markup.button.callback('📢 Вопрос', `stock_send_q_${i}`)],
        [Markup.button.callback('💡 1', `stock_send_h_${i}_1`), Markup.button.callback('💡 2', `stock_send_h_${i}_2`), Markup.button.callback('💡 3', `stock_send_h_${i}_3`)],
        [Markup.button.callback('🔙', 'admin_stock_list')]
    ])});
});
bot.action(/stock_toggle_(\d+)/, (ctx) => {
    STOCK_STATE.isActive = !STOCK_STATE.isActive;
    const i = ctx.match[1];
    // @ts-ignore 
    ctx.match = [null, i]; 
    // @ts-ignore
    return bot.handleUpdate(ctx.update, ctx.webhookReply);
});
const broadcastToPlayers = async (ctx: any, text: string, type: string) => {
    const event = await db.query.events.findFirst({ where: (e, {and, eq}) => and(eq(e.type, type), eq(e.isActive, true)), orderBy: (e, {desc}) => [desc(e.id)] });
    if (!event) return ctx.reply(`❌ Нет игры.`);
    await broadcastToEvent(event.id, text);
    ctx.reply(`✅ Отправлено.`);
};
bot.action(/stock_send_q_(\d+)/, async (ctx) => {
    const i = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await broadcastToPlayers(ctx, `❓ <b>ВОПРОС:</b>\n${STOCK_QUESTIONS[i].q}`, 'stock_know');
});
bot.action(/stock_send_h_(\d+)_(\d+)/, async (ctx) => {
    const [_, qI, hI] = ctx.match;
    await ctx.answerCbQuery();
    const h = STOCK_QUESTIONS[parseInt(qI)][`h${hI}` as 'h1'];
    await broadcastToPlayers(ctx, `💡 <b>ПОДСКАЗКА ${hI}:</b>\n${h}`, 'stock_know');
});
bot.action(/stock_win_(\d+)/, async (ctx) => {
    const uid = parseInt(ctx.match[1]);
    const u = await db.query.users.findFirst({ where: eq(schema.users.telegramId, uid) });
    STOCK_STATE.isActive = false;
    await broadcastToPlayers(ctx, `🏆 <b>СТОП!</b> Победитель: <b>${u?.name}</b>!`, 'stock_know');
    ctx.reply('✅ Победитель объявлен.');
});

// Пульт Fast Dates
bot.action('admin_fd_panel', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const event = await db.query.events.findFirst({ where: (e, {and, eq}) => and(eq(e.type, 'speed_dating'), eq(e.isActive, true)) });
    if (!event) return ctx.reply('Нет активной игры.');
    ctx.editMessageText(`💘 FD: ${event.dateString}\nУчастников: ${FAST_DATES_STATE.participants.size}`, { ...Markup.inlineKeyboard([
        [Markup.button.callback('1️⃣ Загрузить', `fd_load_${event.id}`)],
        [Markup.button.callback('2️⃣ 🔄 Раунд', 'fd_next_round')],
        [Markup.button.callback('3️⃣ ✍️ Ввод', 'fd_input_menu')],
        [Markup.button.callback('4️⃣ 🏁 Расчет', 'fd_calc_matches')],
        [Markup.button.callback('🔙', 'panel')]
    ])});
});
bot.action(/fd_load_(\d+)/, async (ctx) => {
    const eid = parseInt(ctx.match[1]);
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eid), eq(b.paid, true)) });
    FAST_DATES_STATE.participants.clear(); FAST_DATES_STATE.votes.clear(); FAST_DATES_STATE.men = []; FAST_DATES_STATE.women = []; FAST_DATES_STATE.eventId = eid; FAST_DATES_STATE.round = 0;
    const mL: any[] = [], wL: any[] = [];
    for (const b of bookings) { const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) }); if(u) (u.gender === 'Мужчина' ? mL : wL).push(u); }
    let msg = 'Список:\n👩 Ж:\n';
    wL.forEach((u, i) => { const n = i*2+1; FAST_DATES_STATE.women.push(n); FAST_DATES_STATE.participants.set(u.telegramId, { id: u.telegramId, name: u.name||'', username: u.username||'', num: n, gender: 'female' }); msg += `${n}. ${u.name}\n`; });
    msg += '\n👨 М:\n';
    mL.forEach((u, i) => { const n = i*2+2; FAST_DATES_STATE.men.push(n); FAST_DATES_STATE.participants.set(u.telegramId, { id: u.telegramId, name: u.name||'', username: u.username||'', num: n, gender: 'male' }); msg += `${n}. ${u.name}\n`; });
    ctx.reply(msg);
});
bot.action('fd_next_round', (ctx) => {
    if (!FAST_DATES_STATE.participants.size) return ctx.reply('Сначала загрузите!');
    FAST_DATES_STATE.round++;
    const r = FAST_DATES_STATE.round; const t = FAST_DATES_STATE.women.length;
    let msg = `🔔 <b>РАУНД ${r}</b>\n\n`;
    for (let i = 0; i < FAST_DATES_STATE.men.length; i++) {
        const m = FAST_DATES_STATE.men[i];
        const w = FAST_DATES_STATE.women[(i + r - 1) % t];
        if (w) msg += `👨${m} ➡️ 👩${w}\n`;
    }
    ctx.reply(msg, { parse_mode: 'HTML' });
});
bot.action('fd_input_menu', (ctx) => {
    const btns = Array.from(FAST_DATES_STATE.participants.values()).sort((a,b)=>a.num-b.num).map(p => [Markup.button.callback(`${FAST_DATES_STATE.votes.has(p.id)?'✅':''}№${p.num} ${p.name}`, `fd_edit_user_${p.id}`)]);
    ctx.editMessageText('Чью карточку вводим?', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'admin_fd_panel')]]));
});
bot.action(/fd_edit_user_(\d+)/, (ctx) => {
    FAST_DATES_STATE.adminInputTargetId = parseInt(ctx.match[1]);
    ctx.reply('Введите номера (2 5).');
    ctx.answerCbQuery();
});
bot.action('fd_calc_matches', (ctx) => {
    const m: string[] = [];
    FAST_DATES_STATE.participants.forEach(pA => {
        const likesA = FAST_DATES_STATE.votes.get(pA.id) || [];
        likesA.forEach(nB => {
            const pB = Array.from(FAST_DATES_STATE.participants.values()).find(p => p.num === nB);
            if (pB && (FAST_DATES_STATE.votes.get(pB.id)||[]).includes(pA.num) && pA.id < pB.id) {
                m.push(`${pA.name} + ${pB.name}`);
                bot.telegram.sendMessage(pA.id, `🎉 Мэтч! ${pB.name} (@${pB.username})`);
                bot.telegram.sendMessage(pB.id, `🎉 Мэтч! ${pA.name} (@${pA.username})`);
            }
        });
    });
    ctx.reply(`🏁 Пары:\n${m.join('\n') || 'Нет'}`);
});

bot.action('admin_bookings', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const res = await db.select({ e: schema.events.type, d: schema.events.dateString, u: schema.users.name, nick: schema.users.username }).from(schema.bookings).innerJoin(schema.users, eq(schema.bookings.userId, schema.users.id)).innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id)).where(eq(schema.bookings.paid, true));
    let msg = '📋 Записи:\n'; res.forEach(r => msg += `${r.d} ${r.e}: ${r.u} (@${r.nick})\n`); ctx.reply(msg);
});
bot.action('admin_add_event', (ctx) => ctx.reply('/add talk_toast 20.12.2025_19:00 Desc 10'));
bot.command('add', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, t, d, desc, m] = ctx.message.text.split(' ');
    if (!m) return ctx.reply('Error');
    await db.insert(schema.events).values({ type: t, dateString: d.replace('_',' '), description: desc, maxPlayers: parseInt(m), isActive: true });
    ctx.reply('✅');
});
bot.command('reply', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, uid, ...txt] = ctx.message.text.split(' ');
    bot.telegram.sendMessage(uid, `👮‍♂️ ${txt.join(' ')}`);
});

// --- 11. ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ ---

bot.on('message', async (ctx, next) => {
    // 1. Рассылка
    // @ts-ignore
    if (ctx.session?.waitingForBroadcast && ctx.from.id === ADMIN_ID) {
        const users = await db.query.users.findMany();
        let ok = 0;
        await ctx.reply(`🚀 Рассылка...`);
        for (const u of users) { try { await ctx.copyMessage(u.telegramId); ok++; } catch {} await new Promise(r => setTimeout(r, 50)); }
        // @ts-ignore
        ctx.session.waitingForBroadcast = false;
        return ctx.reply(`✅ Доставлено: ${ok}`);
    }
    // 2. Ввод FD
    // @ts-ignore
    if (ctx.from.id === ADMIN_ID && FAST_DATES_STATE.adminInputTargetId && ctx.message.text) {
        // @ts-ignore
        const nums = ctx.message.text.match(/\d+/g)?.map(Number);
        if (nums) {
            FAST_DATES_STATE.votes.set(FAST_DATES_STATE.adminInputTargetId, nums);
            ctx.reply(`✅ Сохранено: ${nums}`);
            FAST_DATES_STATE.adminInputTargetId = 0;
            const btns = Array.from(FAST_DATES_STATE.participants.values()).sort((a,b)=>a.num-b.num).map(p => [Markup.button.callback(`${FAST_DATES_STATE.votes.has(p.id)?'✅':''}№${p.num} ${p.name}`, `fd_edit_user_${p.id}`)]);
            return ctx.reply('Дальше:', Markup.inlineKeyboard([...btns, [Markup.button.callback('🏁 Расчет', 'fd_calc_matches')]]));
        }
    }
    // 3. Stock Answers
    // @ts-ignore
    if (STOCK_STATE.isActive && ctx.message.text) {
        // @ts-ignore
        await bot.telegram.sendMessage(ADMIN_ID, `🧠 Ответ: "${ctx.message.text}"`, { ...Markup.inlineKeyboard([[Markup.button.callback('🏆 WIN', `stock_win_${ctx.from.id}`)]])});
        return;
    }
    // 4. Фото ваучера
    // @ts-ignore
    if (ctx.session?.waitingForVoucher) {
        if (!ctx.message.photo) return ctx.reply('Нужно фото.');
        return next();
    }
    // 5. Поддержка
    // @ts-ignore
    if (ctx.session?.waitingForSupport && ctx.message.text) {
        // @ts-ignore
        await ctx.telegram.sendMessage(ADMIN_ID, `🆘 ${ctx.from.first_name}:\n${ctx.message.text}\n⬇️ /reply ${ctx.from.id} txt`);
        ctx.reply('Отправлено!');
        // @ts-ignore
        ctx.session.waitingForSupport = false;
        return;
    }
    next();
});

// --- 12. ЗАПУСК ---
const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
  console.log(`🚀 Webhook: ${WEBHOOK_URL}`);
  bot.launch({ webhook: { domain: WEBHOOK_URL, port: PORT } });
} else {
  console.log('🛠 Polling');
  bot.launch();
}
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
