import { Telegraf, Markup, session, Scenes } from 'telegraf';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema'; 
import 'dotenv/config';
import Stripe from 'stripe'; // Подключаем Stripe

// --- НАСТРОЙКА БАЗЫ ---
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

// --- НАСТРОЙКА STRIPE ---
// Важно: Убедись, что ключ в .env.local правильный (начинается на sk_live_ или sk_test_)
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is missing');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // Используем стабильную версию API
});

// --- НАСТРОЙКА БОТА ---
const bot = new Telegraf<any>(process.env.TELEGRAM_BOT_TOKEN || '');

const stage = new Scenes.Stage([]); 
bot.use(session());
bot.use(stage.middleware());

// ID Администратора
const ADMIN_ID = 5456905649; 

// --- СЦЕНА РЕГИСТРАЦИИ (АНКЕТА) ---
const registerScene = new Scenes.WizardScene(
  'REGISTER_SCENE',
  async (ctx) => {
    ctx.reply('👋 Добро пожаловать в Allgorithm! Давай начнем с регистрации.\n\n1. Как тебя зовут?');
    return ctx.wizard.next();
  },
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.name = ctx.message.text;
    ctx.reply('2. Твоя дата рождения? (ДД.ММ.ГГГГ)');
    return ctx.wizard.next();
  },
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.birthDate = ctx.message.text;
    ctx.reply('3. Напиши факт о себе, который никто не знает:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.fact = ctx.message.text;
    ctx.reply('4. Самая странная история из твоей жизни:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.story = ctx.message.text;
    ctx.reply('5. Твой пол (для быстрых свиданий):', Markup.keyboard([
      ['Мужчина', 'Женщина']
    ]).oneTime().resize());
    return ctx.wizard.next();
  },
  async (ctx) => {
    // @ts-ignore
    const gender = ctx.message.text;
    // @ts-ignore
    const data = ctx.wizard.state;

    await db.insert(schema.users).values({
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      name: data.name,
      birthDate: data.birthDate,
      fact: data.fact,
      strangeStory: data.story,
      gender: gender,
      isAdmin: ctx.from.id === ADMIN_ID 
    });

    ctx.reply('✅ Регистрация завершена! Добро пожаловать.', getMainKeyboard());
    return ctx.scene.leave();
  }
);

stage.register(registerScene);

// --- ГЛАВНАЯ КЛАВИАТУРА ---
function getMainKeyboard() {
  return Markup.keyboard([
    ['🎮 Игры', '👤 Личный кабинет'],
    ['🆘 Помощь', '📜 Правила']
  ]).resize();
}

// --- КОМАНДА START ---
bot.start(async (ctx) => {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, ctx.from.id)
  });

  if (!user) {
    ctx.scene.enter('REGISTER_SCENE');
  } else {
    ctx.reply(`С возвращением, ${user.name}!`, getMainKeyboard());
  }
});

// --- МЕНЮ: ИГРЫ ---
bot.hears('🎮 Игры', (ctx) => {
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([
    [Markup.button.callback('Talk & Toast 🥂', 'game_talk')],
    [Markup.button.callback('Stock & Know 🧠', 'game_stock')],
    [Markup.button.callback('Быстрые свидания 💘', 'game_dating')]
  ]));
});

// --- МЕНЮ: ЛИЧНЫЙ КАБИНЕТ ---
bot.hears('👤 Личный кабинет', async (ctx) => {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, ctx.from.id)
  });

  if (!user) return ctx.reply('Сначала пройдите регистрацию /start');

  const gamesLeft = 5 - (user.gamesPlayed % 5);
  
  ctx.reply(
    `👤 *Личный кабинет*\n\n` +
    `👤 Имя: ${user.name}\n` +
    `🎂 ДР: ${user.birthDate}\n` +
    `🎲 Игр сыграно: ${user.gamesPlayed}\n` +
    `🎁 До бесплатной игры осталось: ${gamesLeft}`,
    { parse_mode: 'Markdown' }
  );
});

// --- МЕНЮ: ПРАВИЛА ---
bot.hears('📜 Правила', (ctx) => {
  ctx.reply(
    '📜 *Общие правила клуба Allgorithm:*\n\n' +
    '1️⃣ **Уважение:** Мы ценим комфорт каждого участника. Будьте вежливы.\n' +
    '2️⃣ **Оплата:** Место бронируется только после оплаты. Возврат возможен не позднее чем за 24 часа до игры.\n' +
    '3️⃣ **Опоздания:** Игры начинаются вовремя. При опоздании более чем на 15 минут участие не гарантируется.\n\n' +
    'Подробные правила каждой игры можно найти внутри меню "Игры".',
    { parse_mode: 'Markdown' }
  );
});

// --- ЛОГИКА ИГР И ЗАПИСИ ---

// 1. Talk & Toast
// --- ОБНОВЛЕННАЯ ЛОГИКА TALK & TOAST ---

bot.action('game_talk', (ctx) => {
  ctx.editMessageText(
    '🥂 *Talk & Toast*\n\n' + 
    'Уютный ужин за одним большим столом. Никто не меняется местами.\n' +
    'Бот помогает поддерживать разговор интересными вопросами!\n\n' +
    'В конце игры — небольшая викторина про участников.\n' +
    'Макс. игроков: 7',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 Записаться', 'book_talk')],
        [Markup.button.callback('🎲 Дай тему для разговора!', 'get_random_topic')], // <--- НОВАЯ КНОПКА
        [Markup.button.callback('🔙 Назад', 'back_to_games')]
      ])
    }
  );
});

// Обработчик кнопки "Дай тему"
bot.action('get_random_topic', async (ctx) => {
  // Выбираем случайную тему
  const randomTopic = CONVERSATION_TOPICS[Math.floor(Math.random() * CONVERSATION_TOPICS.length)];
  
  // Отправляем как новое сообщение (чтобы не стирать меню)
  await ctx.reply(`🎲 *Тема для обсуждения:*\n\n"${randomTopic}"`, { parse_mode: 'Markdown' });
  
  // Важно: отвечаем телеграму, что кнопка сработала (убирает часики загрузки)
  await ctx.answerCbQuery(); 
});
// 2. Stock & Know
bot.action('game_stock', (ctx) => {
  ctx.editMessageText(
    '🧠 *Stock & Know*\n\n' + 
    'Интеллектуальная биржа знаний. 12 вопросов, ставки на ответы и азарт!\n' +
    'У вас есть 3 подсказки. Победитель забирает приз.\n\n' +
    'Макс. игроков: 8',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 Записаться', 'book_stock')],
        [Markup.button.callback('🔙 Назад к играм', 'back_to_games')]
      ])
    }
  );
});

bot.action('book_stock', async (ctx) => {
  const availableEvents = await db.query.events.findMany({
    where: (events, { eq, and }) => and(
      eq(events.type, 'stock_know'),
      eq(events.isActive, true)
    )
  });

  if (availableEvents.length === 0) return ctx.reply('К сожалению, игр пока нет 😔');

  const buttons = availableEvents.map(event => {
    const label = `${event.dateString} (${event.maxPlayers - event.currentPlayers} мест)`;
    return [Markup.button.callback(label, `pay_event_${event.id}`)];
  });
  buttons.push([Markup.button.callback('🔙 Назад', 'game_stock')]);
  ctx.editMessageText('Выберите дату:', Markup.inlineKeyboard(buttons));
});

// 3. Быстрые свидания
bot.action('game_dating', (ctx) => {
  ctx.editMessageText(
    '💘 *Быстрые свидания*\n\n' + 
    '14 человек, 7 минут на каждое знакомство. \n' +
    'Девушки сидят за столиками, мужчины пересаживаются.\n' +
    'В конце вы отмечаете симпатии, и если они совпадут — мы пришлем контакты!\n\n' +
    'Макс. игроков: 14',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 Записаться', 'book_dating')],
        [Markup.button.callback('🔙 Назад к играм', 'back_to_games')]
      ])
    }
  );
});

bot.action('book_dating', async (ctx) => {
  const availableEvents = await db.query.events.findMany({
    where: (events, { eq, and }) => and(
      eq(events.type, 'speed_dating'),
      eq(events.isActive, true)
    )
  });

  if (availableEvents.length === 0) return ctx.reply('К сожалению, свиданий пока нет 😔');

  const buttons = availableEvents.map(event => {
    const label = `${event.dateString}`;
    return [Markup.button.callback(label, `pay_event_${event.id}`)];
  });
  buttons.push([Markup.button.callback('🔙 Назад', 'game_dating')]);
  ctx.editMessageText('Выберите дату:', Markup.inlineKeyboard(buttons));
});

bot.action('back_to_games', (ctx) => {
  ctx.deleteMessage();
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([
    [Markup.button.callback('Talk & Toast 🥂', 'game_talk')],
    [Markup.button.callback('Stock & Know 🧠', 'game_stock')],
    [Markup.button.callback('Быстрые свидания 💘', 'game_dating')]
  ]));
});

// --- СИСТЕМА ОПЛАТЫ STRIPE ---

// ВСТАВЬТЕ СЮДА ВАШИ ID (которые начинаются на price_...)
const GAME_PRICES: Record<string, string> = {
  'talk_toast': 'price_1SUTjrHhXyjuCWwfhQ7zwxLQ', // Скопируйте из Stripe
  'stock_know': 'price_1SUTkoHhXyjuCWwfxD89YIpP',
  'speed_dating': 'price_1SUTlVHhXyjuCWwfU1IzNMlf',
};

// --- СИСТЕМА ОПЛАТЫ STRIPE ---

bot.action(/pay_event_(\d+)/, async (ctx) => {
  const eventId = parseInt(ctx.match[1]);
  const telegramId = ctx.from?.id;

  if (!telegramId) return;

  try {
    // 1. Находим событие в базе
    const event = await db.query.events.findFirst({
        where: eq(schema.events.id, eventId)
    });
    if (!event) return ctx.reply('Ошибка: игра не найдена');

    // 2. Выбираем правильную цену
    const priceId = GAME_PRICES[event.type];
    if (!priceId) {
        return ctx.reply('⚠️ Ошибка: цена для этой игры не настроена в коде.');
    }

    // 3. Создаем персональную ссылку на оплату
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // или ['card', 'blik'] для Польши
      line_items: [{
        price: priceId, // Используем ваш продукт за 50 PLN
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://t.me/AllgorithmBot?start=success`,
      cancel_url: `https://t.me/AllgorithmBot?start=cancel`,
      // "Клеим" стикер с ID, чтобы узнать плательщика
      metadata: {
        telegramId: telegramId.toString(),
        eventId: eventId.toString(),
      },
    });

    if (!session.url) throw new Error('No URL');

    ctx.reply(
      `💳 Оплата участия: ${event.description || 'Игра'}\nСумма: 50 PLN\n\nНажмите кнопку, чтобы оплатить:`,
      Markup.inlineKeyboard([
        [Markup.button.url('💸 Оплатить картой / BLIK', session.url)],
        [Markup.button.callback('✅ Я оплатил', `confirm_pay_${eventId}`)]
      ])
    );
  } catch (e) {
    console.error('Stripe Error:', e);
    // Выводим ошибку в чат, пока вы настраиваете
    const errorMsg = e instanceof Error ? e.message : String(e);
    ctx.reply(`⚠️ Ошибка Stripe: ${errorMsg}\n\n(Скорее всего, неверный API ключ в Render)`);
  }
});

// Проверка оплаты остается прежней (она работает через поиск сессий)
bot.action(/confirm_pay_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const telegramId = ctx.from?.id.toString();

    if (!telegramId) return;

    try {
        const sessions = await stripe.checkout.sessions.list({ limit: 10 });
        
        const paidSession = sessions.data.find(s => 
            s.metadata?.telegramId === telegramId && 
            s.metadata?.eventId === eventId.toString() &&
            s.payment_status === 'paid'
        );

        if (!paidSession) {
            return ctx.reply('🔍 Оплата пока не найдена. Если оплатили только что, подождите 10 секунд и нажмите снова.');
        }

        const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from!.id)});
        if (!user) return;

        const existingBooking = await db.query.bookings.findFirst({
            where: (bookings, { and, eq }) => and(
                eq(bookings.userId, user.id),
                eq(bookings.eventId, eventId)
            )
        });

        if (existingBooking) return ctx.reply('✅ Вы уже записаны!');

        await db.insert(schema.bookings).values({
            userId: user.id,
            eventId: eventId,
            paid: true
        });

        // +1 игрок
        const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
        if (event) {
             await db.update(schema.events)
                .set({ currentPlayers: (event.currentPlayers || 0) + 1 })
                .where(eq(schema.events.id, eventId));
        }

        ctx.editMessageText('🎉 Оплата (50 PLN) получена! Вы в игре.');

    } catch (e) {
        console.error('Check Error:', e);
        ctx.reply('Ошибка проверки.');
    }
});

// Темы для разговоров (Talk & Toast)
const CONVERSATION_TOPICS = [
  "🎬 Какой фильм ты можешь пересматривать бесконечно?",
  "✈️ В какую страну ты бы поехал прямо сейчас, если бы бюджет был не ограничен?",
  "🍕 Если бы тебе пришлось есть одно блюдо до конца жизни, что бы это было?",
  "Superpower 🦸‍♂️: Какую суперспособность ты бы выбрал и почему?",
  "🎵 Какая песня заставляет тебя танцевать, даже если никто не смотрит?",
  "😱 Какой твой самый странный страх?",
  "📚 Какую книгу ты бы посоветовал каждому прочитать?",
  "💼 Кем ты хотел стать в детстве?",
  "🎁 Какой самый запоминающийся подарок ты получал?",
  "🕒 Если бы в сутках был 25-й час, на что бы ты его тратил?",
];
// --- ПОДДЕРЖКА И АДМИНКА ---

bot.hears('🆘 Помощь', (ctx) => {
  ctx.reply('Напиши свой вопрос следующим сообщением, я перешлю его администратору.');
  // @ts-ignore
  ctx.session = { waitingForSupport: true };
});

bot.on('message', async (ctx, next) => {
  // @ts-ignore
  if (ctx.session?.waitingForSupport && ctx.message.text) {
    await ctx.telegram.sendMessage(ADMIN_ID, `🆘 ВОПРОС от ID: ${ctx.from.id}\nИмя: ${ctx.from.first_name}\n\n"${ctx.message.text}"\n\n⬇️ Ответить: /reply ${ctx.from.id} Текст`);
    ctx.reply('Ваш вопрос отправлен! Ждите ответа.');
    // @ts-ignore
    ctx.session.waitingForSupport = false;
    return;
  }
  next();
});

// --- АДМИН ПАНЕЛЬ ---
bot.command('panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  ctx.reply('🔒 Админ-панель', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить игру', 'admin_add_event')],
    [Markup.button.callback('📋 Кто записался?', 'admin_bookings')], // <--- НОВАЯ КНОПКА
    [Markup.button.callback('📊 Статистика', 'admin_stats')]
  ]));
});

// Обработчик кнопки "Список записей"
bot.action('admin_bookings', async (ctx) => {
    // Проверка на админа
    if (ctx.from?.id !== ADMIN_ID) return;

    try {
        // 1. Делаем сложный запрос: объединяем Таблицу Брони + Юзеров + События
        // Нам нужно достать имена людей и названия игр, на которые они записались
        const result = await db.select({
            eventName: schema.events.type,
            eventDate: schema.events.dateString,
            eventDesc: schema.events.description,
            userName: schema.users.name,
            userNick: schema.users.username,
            paid: schema.bookings.paid
        })
        .from(schema.bookings)
        .innerJoin(schema.users, eq(schema.bookings.userId, schema.users.id))
        .innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id))
        .where(eq(schema.bookings.paid, true)); // Берем только тех, кто реально оплатил

        if (result.length === 0) {
            return ctx.reply('📭 Пока нет оплаченных записей.');
        }

        // 2. Группируем список по играм
        // Чтобы было красиво: Сначала Дата, потом список людей под ней
        const report = new Map<string, string[]>();

        result.forEach(row => {
            // Формируем заголовок игры: "20.12 (Talk & Toast)"
            const header = `${row.eventDate} | ${row.eventDesc || row.eventName}`;
            
            if (!report.has(header)) {
                report.set(header, []);
            }
            
            // Формируем строку про человека: "1. Имя (@nick)"
            const userLine = `${row.userName} (@${row.userNick || 'без ника'})`;
            report.get(header)?.push(userLine);
        });

        // 3. Собираем итоговое сообщение
        let message = '📋 <b>Список участников (Оплачено):</b>\n\n';
        
        report.forEach((participants, header) => {
            message += `🗓 <b>${header}</b>\n`;
            participants.forEach((p, i) => {
                message += `  ${i + 1}. ${p}\n`;
            });
            message += '\n';
        });

        // Отправляем (используем HTML для жирного шрифта)
        ctx.reply(message, { parse_mode: 'HTML' });

    } catch (e) {
        console.error('Ошибка админки:', e);
        ctx.reply('Ошибка при получении списка.');
    }
});

bot.action('admin_add_event', (ctx) => {
    ctx.reply('Формат добавления:\n/add talk_toast 20.12.2025_19:00 Азия 7');
});

bot.command('add', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 5) return ctx.reply('Ошибка формата');

    await db.insert(schema.events).values({
        type: args[1],
        dateString: args[2].replace('_', ' '),
        description: args[3],
        maxPlayers: parseInt(args[4]),
        currentPlayers: 0,
        isActive: true
    });
    ctx.reply('✅ Игра добавлена!');
});

bot.command('reply', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    const userId = args[1];
    const text = args.slice(2).join(' ');
    bot.telegram.sendMessage(userId, `👮‍♂️ Ответ: ${text}`).catch(() => {});
    ctx.reply('Отправлено.');
});

// --- ЗАПУСК (WEBHOOK / POLLING) ---
const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL; 

if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
  console.log(`🚀 Webhook mode: ${WEBHOOK_URL} port ${PORT}`);
  bot.launch({
    webhook: {
      domain: WEBHOOK_URL,
      port: PORT
    }
  }).then(() => console.log('✅ Webhook started'));
} else {
  console.log('🛠 Polling mode');
  bot.launch().then(() => console.log('✅ Polling started'));
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
