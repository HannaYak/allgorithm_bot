import { Telegraf, Markup, session, Scenes } from 'telegraf';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema'; // Путь к схеме
import 'dotenv/config';
import http from 'http';

// --- НАСТРОЙКА БАЗЫ ---
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

// --- НАСТРОЙКА БОТА ---
const bot = new Telegraf<any>(process.env.TELEGRAM_BOT_TOKEN || '');

// Чтобы работали сцены (пошаговая анкета)
const stage = new Scenes.Stage([]); 
bot.use(session());
bot.use(stage.middleware());

// ID Администратора (замените на свой ID, чтобы работала панель)
// Узнать свой ID можно в боте @userinfobot
const ADMIN_ID = 5456905649; 

// --- СЦЕНА РЕГИСТРАЦИИ (АНКЕТА) ---
const registerScene = new Scenes.WizardScene(
  'REGISTER_SCENE',
  // Шаг 1: Имя
  async (ctx) => {
    ctx.reply('👋 Добро пожаловать в Allgorithm! Давай начнем с регистрации.\n\n1. Как тебя зовут?');
    return ctx.wizard.next();
  },
  // Шаг 2: Дата рождения
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.name = ctx.message.text;
    ctx.reply('2. Твоя дата рождения? (ДД.ММ.ГГГГ)');
    return ctx.wizard.next();
  },
  // Шаг 3: Факт
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.birthDate = ctx.message.text;
    ctx.reply('3. Напиши факт о себе, который никто не знает:');
    return ctx.wizard.next();
  },
  // Шаг 4: История
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.fact = ctx.message.text;
    ctx.reply('4. Самая странная история из твоей жизни:');
    return ctx.wizard.next();
  },
  // Шаг 5: Пол
  async (ctx) => {
    // @ts-ignore
    ctx.wizard.state.story = ctx.message.text;
    ctx.reply('5. Твой пол (для быстрых свиданий):', Markup.keyboard([
      ['Мужчина', 'Женщина']
    ]).oneTime().resize());
    return ctx.wizard.next();
  },
  // Финал: Сохранение
  async (ctx) => {
    // @ts-ignore
    const gender = ctx.message.text;
    // @ts-ignore
    const data = ctx.wizard.state;

    // Сохраняем в БД
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

// Добавляем сцену в бота
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
    // Если пользователя нет в базе — запускаем анкету
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

  // Считаем, сколько осталось до бесплатной игры (каждая 5-я бесплатно)
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

// --- ОБРАБОТКА ВЫБОРА ИГРЫ (ПРИМЕР ДЛЯ Talk & Toast) ---
bot.action('game_talk', (ctx) => {
  ctx.editMessageText(
    '🥂 *Talk & Toast*\n\n' + 
    'Один большой стол, никто не меняется. В любой момент можно запросить тему для разговора.\n' +
    'В конце — викторина!\n\n' +
    'Макс. игроков: 7',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 Записаться', 'book_talk')],
        [Markup.button.callback('🔙 Назад', 'back_to_games')]
      ])
    }
  );
});

bot.action('back_to_games', (ctx) => {
  ctx.deleteMessage();
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([
    [Markup.button.callback('Talk & Toast 🥂', 'game_talk')],
    [Markup.button.callback('Stock & Know 🧠', 'game_stock')],
    [Markup.button.callback('Быстрые свидания 💘', 'game_dating')]
  ]));
});

// --- ЗАПИСЬ НА ИГРУ (ВЫБОР ДАТЫ) ---
bot.action('book_talk', async (ctx) => {
  // Ищем активные игры этого типа в базе
  const availableEvents = await db.query.events.findMany({
    where: (events, { eq, and, gt }) => and(
      eq(events.type, 'talk_toast'),
      eq(events.isActive, true)
    )
  });

  if (availableEvents.length === 0) {
    return ctx.reply('К сожалению, на ближайшее время игр нет 😔');
  }

  const buttons = availableEvents.map(event => {
    // Формат: "20.12 (Азия) 1/7"
    const label = `${event.dateString} (${event.description}) ${event.currentPlayers}/${event.maxPlayers}`;
    return [Markup.button.callback(label, `pay_event_${event.id}`)];
  });

  ctx.reply('Выберите дату:', Markup.inlineKeyboard(buttons));
});

// --- ИГРА: STOCK & KNOW ---
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

// --- ЗАПИСЬ НА STOCK & KNOW ---
bot.action('book_stock', async (ctx) => {
  const availableEvents = await db.query.events.findMany({
    where: (events, { eq, and }) => and(
      eq(events.type, 'stock_know'), // Ищем только этот тип игр
      eq(events.isActive, true)
    )
  });

  if (availableEvents.length === 0) {
    return ctx.reply('К сожалению, игр Stock & Know на ближайшее время нет 😔');
  }

  const buttons = availableEvents.map(event => {
    const label = `${event.dateString} (${event.maxPlayers - event.currentPlayers} мест)`;
    return [Markup.button.callback(label, `pay_event_${event.id}`)];
  });
  
  // Добавляем кнопку назад
  buttons.push([Markup.button.callback('🔙 Назад', 'game_stock')]);

  ctx.editMessageText('Выберите дату для Stock & Know:', Markup.inlineKeyboard(buttons));
});

// --- ИГРА: БЫСТРЫЕ СВИДАНИЯ ---
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

// --- ЗАПИСЬ НА СВИДАНИЯ ---
bot.action('book_dating', async (ctx) => {
  const availableEvents = await db.query.events.findMany({
    where: (events, { eq, and }) => and(
      eq(events.type, 'speed_dating'), // Ищем свидания
      eq(events.isActive, true)
    )
  });

  if (availableEvents.length === 0) {
    return ctx.reply('К сожалению, Быстрых свиданий на ближайшее время нет 😔');
  }

  const buttons = availableEvents.map(event => {
    const label = `${event.dateString}`;
    return [Markup.button.callback(label, `pay_event_${event.id}`)];
  });

  buttons.push([Markup.button.callback('🔙 Назад', 'game_dating')]);

  ctx.editMessageText('Выберите дату для Свиданий:', Markup.inlineKeyboard(buttons));
});

// --- ОПЛАТА (ЗАГЛУШКА) ---
bot.action(/pay_event_(\d+)/, async (ctx) => {
  const eventId = parseInt(ctx.match[1]);
  
  // Тут должна быть ссылка на Stripe
  // Пока делаем имитацию
  ctx.reply('💳 Ссылка на оплату Stripe (тест). Нажмите кнопку, когда оплатите.', Markup.inlineKeyboard([
    [Markup.button.callback('✅ Я оплатил', `confirm_pay_${eventId}`)]
  ]));
});

bot.action(/confirm_pay_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id)});

    if (!user) return;

    // Записываем в базу
    await db.insert(schema.bookings).values({
        userId: user.id,
        eventId: eventId,
        paid: true
    });

    // Обновляем счетчик игроков
    // (В реальном проекте тут нужна транзакция, но пока просто)
    // Тут нужен SQL update, для простоты просто скажем ОК
    ctx.reply('✅ Оплата прошла! Вы записаны на игру. Ждем вас!');
});

// --- МЕНЮ: ПОМОЩЬ (ЧАТ С АДМИНОМ) ---
bot.hears('🆘 Помощь', (ctx) => {
  ctx.reply('Напиши свой вопрос следующим сообщением, я перешлю его администратору.');
  // Ставим метку сессии, что ждем вопрос
  // @ts-ignore
  ctx.session = { waitingForSupport: true };
});

// Пересылка сообщений
bot.on('message', async (ctx, next) => {
  // @ts-ignore
  if (ctx.session?.waitingForSupport && ctx.message.text) {
    // Пересылаем админу
    await ctx.telegram.sendMessage(ADMIN_ID, `🆘 ВОПРОС от ID: ${ctx.from.id}\nИмя: ${ctx.from.first_name}\n\n"${ctx.message.text}"\n\n⬇️ Чтобы ответить, напиши: /reply ${ctx.from.id} Текст ответа`);
    
    ctx.reply('Ваш вопрос отправлен администратору! Ожидайте ответа.');
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
    [Markup.button.callback('📊 Статистика', 'admin_stats')]
  ]));
});

// Пример добавления игры (упрощенно)
bot.action('admin_add_event', (ctx) => {
    ctx.reply('Чтобы добавить игру, введи команду в чат:\n\n/add talk_toast 20.12.2025_19:00 Азия 7\n(Тип Дата Описание МаксИгроков)');
});

bot.command('add', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    // /add talk_toast 20.12... Азия 7
    if (args.length < 5) return ctx.reply('Ошибка формата');

    await db.insert(schema.events).values({
        type: args[1],
        dateString: args[2].replace('_', ' '),
        description: args[3],
        maxPlayers: parseInt(args[4]),
        currentPlayers: 0,
        isActive: true
    });

    ctx.reply('✅ Игра добавлена в расписание!');
});

// Ответ админа пользователю (/reply ID Текст)
bot.command('reply', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    const userId = args[1];
    const text = args.slice(2).join(' ');

    bot.telegram.sendMessage(userId, `👮‍♂️ Ответ администратора:\n\n${text}`)
        .then(() => ctx.reply('Ответ отправлен'))
        .catch(() => ctx.reply('Ошибка отправки (пользователь заблочил бота?)'));
});

// --- ЗАПУСК БОТА ---

const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL; 
// Эта переменная должна быть в Environment Variables на Render!
// Пример: https://allgorithm-bot-1.onrender.com

if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
  // РЕЖИМ PRODUCTION (RENDER)
  // Используем Webhook, чтобы не было конфликтов
  console.log(`🚀 Запуск в режиме Webhook на порту ${PORT}`);
  
  // Telegraf сам поднимет сервер на нужном порту
  bot.launch({
    webhook: {
      domain: WEBHOOK_URL, // Ваш URL от Render
      port: PORT
    }
  }).then(() => {
    console.log('✅ Бот запущен через Webhook');
  });

} else {
  // РЕЖИМ DEVELOPMENT (ЛОКАЛЬНО)
  // Используем Polling для удобства
  console.log('🛠 Запуск в режиме Polling (локально)');
  
  bot.launch().then(() => {
    console.log('✅ Бот запущен через Polling');
  });
}

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
