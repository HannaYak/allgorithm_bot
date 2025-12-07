import { Telegraf, Markup, session, Scenes } from 'telegraf';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../drizzle/schema'; 
import 'dotenv/config';
import Stripe from 'stripe';
import { DateTime } from 'luxon';

// --- 1. НАСТРОЙКИ ---

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is missing');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

// Цены
const GAME_PRICES: Record<string, string> = {
  'talk_toast': 'price_1SUTjrHhXyjuCWwfhQ7zwxLQ', 
  'stock_know': 'price_1SUTkoHhXyjuCWwfxD89YIpP',
  'speed_dating': 'price_1SUTlVHhXyjuCWwfU1IzNMlf',
};
const STRIPE_COUPON_ID = '8RiQPzVX'; 
const ADMIN_ID = 5456905649; 

const PROCESSED_AUTO_ACTIONS = new Set<string>(); 

// --- 2. КОНТЕНТ (ВОПРОСЫ И ТЕМЫ) ---

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

// Полный список вопросов по сценарию (27 раундов)
const STOCK_QUESTIONS = [
  // Раунд 1
  {
    q: "Назовите, сколько всего славянских народов выделяют в современной этнологии?",
    h1: "Ровно столько городов и крепостей удостоены звания «Город-герой».",
    h2: "Ровно столько лунных циклов проходит за один земной год.",
    h3: "Это несчастливое число из франшизы хорроров (Джейсон Вурхиз).",
    a: "13"
  },
  // Раунд 2
  {
    q: "Согласно Вавилонскому представлению о мире он состоит именно из такого количества частей. Назовите число.",
    h1: "Через столько столиц проходила пресловутая «Ось зла».",
    h2: "Столько кружек пива заказал герой Фассбендера в «Бесславных ублюдках», выдав себя.",
    h3: "Столько империй участвовало в разделах Речи Посполитой.",
    a: "3"
  },
  // Раунд 3
  {
    q: "Назовите номер модели бомбардировщика серии B («Летающая крепость»), сбросившего бомбы на Японию.",
    h1: "Столько астрономических единиц между Землей и Плутоном при максимальном сближении.",
    h2: "В 19__ году в США началась Великая депрессия (последние две цифры).",
    h3: "Столько дней в феврале в високосный год.",
    a: "29"
  },
  // Раунд 4
  {
    q: "Сколько всего династий правило в Китае?",
    h1: "Число, от которого отталкивалась математика древних Майя.",
    h2: "Ровно столько молочных зубов должно быть за жизнь у человека.",
    h3: "Столько тысяч лье под водой в названии книги Жюля Верна.",
    a: "20"
  },
  // Раунд 5
  {
    q: "Назовите количество Новых чудес света (список 2007 года).",
    h1: "Столько звёзд образуют ковш Большой Медведицы.",
    h2: "Число января, когда отмечается православное Рождество.",
    h3: "Столько футов под килем желают морякам.",
    a: "7"
  },
  // Раунд 6
  {
    q: "Назовите число, равное количеству лунных циклов между Олимпийскими играми.",
    h1: "Через столько лет отмечают «Золотую свадьбу».",
    h2: "Столько штатов сейчас входят в состав США.",
    h3: "Число в псевдониме популярного рэпера (Curtis Jackson).",
    a: "50"
  },
  // Раунд 7
  {
    q: "Сколько родов войск обычно насчитывается в большинстве стран?",
    h1: "Столько базовых чувств выделяют у человека.",
    h2: "Столько стран — постоянных членов Совбеза ООН.",
    h3: "Число в названии фильма с Миллой Йовович («__ элемент»).",
    a: "5"
  },
  // Раунд 8
  {
    q: "Сколько всего человек побывало на Лунной поверхности за всю историю?",
    h1: "Столько камней поставил Моисей у подножья горы Синай.",
    h2: "В гавайском алфавите ровно столько букв.",
    h3: "Столько «разгневанных мужчин» в названии фильма про суд.",
    a: "12"
  },
  // Раунд 9
  {
    q: "Сколько недель продержался маленький город Козельск против монгольского нашествия?",
    h1: "Столько планет в Солнечной системе (без Плутона, но с Землей? Нет, это подсказка про чудеса света). Столько чудес света в Древнем мире.",
    h2: "Количество континентов на Земле (по популярной версии).",
    h3: "Столько основных нот в гамме.",
    a: "7"
  },
  // Раунд 10
  {
    q: "Сколько существует сортов чая (по степени ферментации)?",
    h1: "Столько игроков на поле в команде по волейболу.",
    h2: "Среднее количество ног у насекомых.",
    h3: "Количество букв в английском алфавите от E до K включительно.",
    a: "6"
  },
  // Раунд 11
  {
    q: "Сколько дней держал оборону гарнизон Брестской крепости (пока линия фронта не ушла далеко)?",
    h1: "Атомный номер элемента Германий.",
    h2: "Точка замерзания воды по шкале Фаренгейта.",
    h3: "Столько зубов у взрослого человека.",
    a: "32"
  },
  // Раунд 12
  {
    q: "Какова была длина дирижабля «Гинденбург» (в метрах)?",
    h1: "Телефонный код Гвинеи-Бисау.",
    h2: "Столько минут длится режиссерская версия «Властелин Колец: Возвращение короля».",
    h3: "Столько лет назад (от 2021) началась независимость США.",
    a: "245"
  },
  // Раунд 13
  {
    q: "Число культовой помады Dior (счастливое число Кристиана Диора).",
    h1: "Последние три цифры года «Проблемы 2000» (Y2K).",
    h2: "Популярный номер экстренных служб (например, в Польше/Британии).",
    h3: "Самый большой трехзначный палиндром.",
    a: "999"
  },
  // Раунд 14
  {
    q: "В скольких тюрьмах побывал рецидивист Чарльз Бронсон?",
    h1: "Столько лет Бог отвел жизни людей перед Потопом (Бытие).",
    h2: "Столько минут в двух часах.",
    h3: "Римскими цифрами: CXX.",
    a: "120"
  },
  // Раунд 15
  {
    q: "Сколько спутников у Юпитера официально подтверждено?",
    h1: "Код региона Чечня на номерах (изначальный).",
    h2: "Год выхода «Истории игрушек» (19__).",
    h3: "Столько тезисов Мартин Лютер прибил к дверям церкви.",
    a: "95"
  },
  // Раунд 16
  {
    q: "На сколько процентов (по массе) земная кора состоит из кислорода?",
    h1: "Атомный номер Индия.",
    h2: "В 49 году до н.э. Цезарь перешел Рубикон.",
    h3: "Японское несчастливое число (звучит как «смертные муки»).",
    a: "49"
  },
  // Раунд 17
  {
    q: "Число в названии печально известного клуба музыкантов (Кобейн, Уайнхаус, Хендрикс).",
    h1: "Столько костей в кисти руки.",
    h2: "Столько поправок в Конституции США.",
    h3: "Столько стран в Евросоюзе.",
    a: "27"
  },
  // Раунд 18
  {
    q: "Сколько лет провёл в заточении герой фильма «Олдбой»?",
    h1: "Карта Таро «Дьявол» (XV).",
    h2: "Столько лет было «Пятнадцатилетнему капитану».",
    h3: "Количество костяшек в игре «Пятнашки».",
    a: "15"
  },
  // Раунд 19
  {
    q: "Сколько всего Великих Домов Вестероса выделяют в каноне «Игры престолов»?",
    h1: "Номер симфонии Бетховена («Ода к радости»).",
    h2: "Наибольшее однозначное число.",
    h3: "Столько месяцев длится беременность.",
    a: "9"
  },
  // Раунд 20
  {
    q: "Сколько гномов входило в отряд Торина Дубощита («Хоббит»)?",
    h1: "Столько полос на флаге США.",
    h2: "Столько карт одной масти в колоде.",
    h3: "«Чёртова дюжина».",
    a: "13"
  },
  // Раунд 21
  {
    q: "Номер правила интернета: «Если это существует, про это есть порнография».",
    h1: "Телефонный код Испании.",
    h2: "Номер легендарного танка Т-__.",
    h3: "Номер Шакила О’Нила в «Лейкерс».",
    a: "34"
  },
  // Раунд 22
  {
    q: "Какой номер был у последнего участника «Игры в кальмара» (Сон Ги Хун)?",
    h1: "Последовательность 4-5-6.",
    h2: "456 + 404 = 860.",
    h3: "Ferrari 456 GT.",
    a: "456"
  },
  // Раунд 23
  {
    q: "Сколько официальных студийных альбомов выпустили The Beatles?",
    h1: "Атомный номер Алюминия.",
    h2: "Столько карт одной масти.",
    h3: "Ряд, который пропускают в самолетах.",
    a: "13"
  },
  // ТЕМА: КИНО
  {
    q: "🎬 КИНО: Сколько пиратских баронов входило в Совет Братства («Пираты Карибского моря»)?",
    h1: "Столько кругов ада у Данте.",
    h2: "Столько Назгулов искали Фродо.",
    h3: "Столько жизней у кошки.",
    a: "9"
  },
  // ТЕМА: МУЗЫКА
  {
    q: "🎵 МУЗЫКА: В каком году вышел хит Scorpions «Wind of Change»?",
    h1: "Год выхода альбома Nirvana «Nevermind».",
    h2: "Год-палиндром.",
    h3: "Год Беловежского соглашения (распад СССР).",
    a: "1991"
  },
  // ТЕМА: МЕМЫ
  {
    q: "😂 МЕМЫ: Какую сумму в долларах называют в меме Gachimuchi за услуги?",
    h1: "Максимальные очки в боулинге.",
    h2: "Римскими: CCC.",
    h3: "Ассоциируется с трактористом... шутка. С 300 спартанцами.",
    a: "300"
  },
  // БЛИЦ
  {
    q: "⚡️ БЛИЦ: Какова скорость эякулята (км/ч) при естественном извержении?",
    h1: "Номер Майкла Джордана (после возвращения).",
    h2: "Год основания ООН (19__).",
    h3: "Половина прямого угла (градусов).",
    a: "45"
  }
];

// --- 3. СОСТОЯНИЕ (STATE) ---

const FAST_DATES_STATE = {
    eventId: 0, round: 0, votes: new Map<number, number[]>(),
    participants: new Map<number, { id: number, name: string, username: string, num: number, gender: string }>(),
    men: [] as number[], women: [] as number[], adminInputTargetId: 0 
};

const STOCK_STATE = { isActive: false, currentQuestionId: 0 };
const TALK_STATE = { currentFact: '', currentUser: '', isActive: false };

// --- 4. БОТ И СЦЕНЫ ---

const bot = new Telegraf<any>(process.env.TELEGRAM_BOT_TOKEN || '');
const stage = new Scenes.Stage([]); 
bot.use(session());
bot.use(stage.middleware());

// --- 5. АВТОПИЛОТ ---
setInterval(async () => {
    try {
        const now = DateTime.now(); 
        const activeEvents = await db.query.events.findMany({ where: eq(schema.events.isActive, true) });

        for (const event of activeEvents) {
            const start = DateTime.fromFormat(event.dateString, "dd.MM.yyyy HH:mm");
            if (!start.isValid) continue;

            const diffHours = start.diff(now, 'hours').hours;
            const diffMinutes = start.diff(now, 'minutes').minutes;

            // 1. ЗА 3 ДНЯ (72 часа)
            if (diffHours >= 71.5 && diffHours <= 72.5) {
                const actionId = `remind_3d_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    await broadcastToEvent(event.id, 
                        `📅 <b>Скоро игра!</b>\n\nНапоминаем, что через 3 дня (${start.toFormat('dd.MM')}) состоится игра "${event.description || event.type}".\n\nГотовьтесь к классному вечеру! 🥂`
                    );
                }
            }

            // 2. ЗА 24 ЧАСА
            if (diffHours >= 23.5 && diffHours <= 24.5) {
                const actionId = `remind_24h_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    await broadcastToEvent(event.id, 
                        `🔔 <b>Уже завтра!</b>\n\nЖдем вас в ${start.toFormat('HH:mm')} на игре.\nЕсли планы изменились — напишите нам через кнопку "Помощь".`
                    );
                }
            }

            // 3. ЗА 2 ЧАСА
            if (diffHours >= 1.8 && diffHours <= 2.2) {
                const actionId = `remind_2h_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    await broadcastToEvent(event.id, 
                        `🚀 <b>Скоро начинаем!</b>\n\nСтарт через 2 часа.\n📍 Адрес в билете.\nНе опаздывайте!`
                    );
                }
            }

            // 4. АВТО-ВИКТОРИНА (через 105 мин после старта)
            const minutesSinceStart = now.diff(start, 'minutes').minutes;
            if (event.type === 'talk_toast' && minutesSinceStart >= 105 && minutesSinceStart < 115) {
                const actionId = `quiz_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    runAutoQuiz(event.id); 
                }
            }

            // 5. АВТО-ЗАВЕРШЕНИЕ (через 130 мин после старта)
            if (minutesSinceStart >= 130) {
                const actionId = `close_${event.id}`;
                if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
                    PROCESSED_AUTO_ACTIONS.add(actionId);
                    autoCloseEvent(event.id); 
                }
            }
        }
    } catch (e) { console.error("Autopilot Error:", e); }
}, 60000); 

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function broadcastToEvent(eventId: number, text: string) {
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
    for (const b of bookings) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
        if (u) bot.telegram.sendMessage(u.telegramId, text, { parse_mode: 'HTML' }).catch(()=>{});
    }
}

async function runAutoQuiz(eventId: number) {
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
    if (bookings.length < 2) return; 
    await broadcastToEvent(eventId, `🔔 <b>Викторина!</b> Угадываем факты друг о друге.`);
    await delay(5000);
    const shuffled = bookings.sort(() => 0.5 - Math.random()).slice(0, 3);
    for (const booking of shuffled) {
        const user = await db.query.users.findFirst({ where: eq(schema.users.id, booking.userId) });
        if (!user) continue;
        const fact = (user.fact && user.fact.length > 2) ? user.fact : user.strangeStory;
        if (!fact) continue;
        await broadcastToEvent(eventId, `❓ <b>Чей это факт?</b>\n"${fact}"`);
        await delay(30000); 
        await broadcastToEvent(eventId, `🔓 <b>Это:</b> ${user.name}!`);
        await delay(5000);
    }
    await broadcastToEvent(eventId, `🏁 Игра окончена! Спасибо всем.`);
}

async function autoCloseEvent(eventId: number) {
    await db.update(schema.events).set({ isActive: false }).where(eq(schema.events.id, eventId));
    const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
    for (const b of bookings) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
        if (u) {
             await db.update(schema.users).set({ gamesPlayed: (u.gamesPlayed||0)+1 }).where(eq(schema.users.id, u.id));
             bot.telegram.sendMessage(u.telegramId, '🎁 Игра закрыта. +1 балл лояльности!').catch(()=>{});
        }
    }
}

// --- 6. РЕГИСТРАЦИЯ И МЕНЮ ---

const registerScene = new Scenes.WizardScene('REGISTER_SCENE',
  async (ctx) => { 
      ctx.reply(`👋 Привет! Добро пожаловать в наш клуб знакомств, общения и интересных встреч.

Здесь мы создаём пространство, где люди находят друзей, партнёров, единомышленников и просто приятно проводят время.

У нас три формата мероприятий — от уютных ужинов до быстрых мини-свиданий и интеллектуальных игр.

Чтобы мы могли подобрать для тебя лучший опыт и корректно бронировать места, давай сначала немного познакомимся.
Регистрация проходит один раз и навсегда — всего 5 коротких вопросов, это займёт около минуты.

Готов начать?

1. Как тебя зовут?`);
      return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.name = ctx.message.text; ctx.reply('2. Твоя дата рождения? (ДД.ММ.ГГГГ)'); return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.birthDate = ctx.message.text; ctx.reply('3. Напиши факт о себе, который никто не знает:'); return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.fact = ctx.message.text; ctx.reply('4. Самая странная история из твоей жизни:'); return ctx.wizard.next(); 
  },
  async (ctx) => { 
      // @ts-ignore
      ctx.wizard.state.story = ctx.message.text; ctx.reply('5. Твой пол (для быстрых свиданий):', Markup.keyboard([['Мужчина', 'Женщина']]).oneTime().resize()); return ctx.wizard.next(); 
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

function getMainKeyboard() { return Markup.keyboard([['🎮 Игры', '👤 Личный кабинет'], ['🆘 Помощь', '📜 Правила']]).resize(); }

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

// --- ПРАВИЛА (СГРУППИРОВАННЫЕ) ---
bot.hears('📜 Правила', (ctx) => {
    ctx.reply(
        '📜 <b>Правила клуба Allgorithm</b>\n\n' +
        '<b>🔻 ОБЩИЕ ПРАВИЛА:</b>\n' +
        '1. <b>18+:</b> Строго для совершеннолетних. Врать про возраст — ваша ответственность.\n' +
        '2. <b>Честная игра:</b> Без обмана, гугла и мухлеж. Мы здесь за кайфом!\n' +
        '3. <b>Культура:</b> Мат, спам и оскорбления = бан без разговоров.\n' +
        '4. <b>Оплата:</b> Нет оплаты — нет регистрации. Платеж — ваш входной билет.\n' +
        '5. <b>Администрация:</b> Слово ведущего — закон. Можем удалить за нарушение без возврата средств.\n\n' +
        '<b>🔻 ВОЗВРАТ СРЕДСТВ:</b>\n' +
        '1. <b>За 24 часа:</b> Предупредите за сутки — вернем деньги.\n' +
        '2. <b>Менее 24 часов:</b> Деньги не возвращаются.\n' +
        '3. <b>Отмена игры:</b> Если отменим мы — вернем всем.\n\n' +
        '<b>🔻 ПРАВИЛА ПОВЕДЕНИЯ:</b>\n' +
        '1. <b>Тайминг:</b> Приходите за 10 минут (в 16:00), чтобы заказать еду.\n' +
        '2. <b>Тишина:</b> Не болтать во время объяснения правил.\n' +
        '3. <b>Без советов:</b> Не перебивайте ведущих. Все жалобы и советы — в конце вечера.\n' +
        '4. <b>Атмосфера:</b> Оставляем неуместные комментарии и душноту дома. Если вопрос не нравится — это часть игры.',
        { parse_mode: 'HTML' }
    );
});

bot.hears('🆘 Помощь', (ctx) => { ctx.reply('Напиши свой вопрос следующим сообщением.'); 
// @ts-ignore
ctx.session = { waitingForSupport: true }; });

// --- 7. ЛОГИКА ИГР ---

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
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([[Markup.button.callback('Talk & Toast 🥂', 'game_talk')], [Markup.button.callback('Stock & Know 🧠', 'game_stock')], [Markup.button.callback('Fast Dates 💘', 'game_dating')]]));
});

bot.action('my_games', async (ctx) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
    if (!user) return;
    const myBookings = await db.select({ t: schema.events.type, d: schema.events.dateString, desc: schema.events.description }).from(schema.bookings).innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id)).where((b, { and, eq }) => and(eq(b.userId, user.id), eq(b.paid, true), eq(schema.events.isActive, true)));
    if (myBookings.length === 0) return ctx.reply('📭 У вас нет активных записей.');
    let msg = '📅 <b>Ваши билеты:</b>\n\n';
    myBookings.forEach(b => msg += `🗓 <b>${b.d}</b> | ${b.t}\n📍 ${b.ds}\n\n`);
    ctx.reply(msg, { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

// --- 8. ОПЛАТА ---

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

// --- 10. АДМИНКА ---

bot.command('panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply('🔒 Админ-панель', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить игру', 'admin_add_event')],
    [Markup.button.callback('🏁 ЗАВЕРШИТЬ ИГРУ', 'admin_close_event')], 
    [Markup.button.callback('📢 Рассылка', 'admin_broadcast_start')],
    [Markup.button.callback('📋 Записи', 'admin_bookings')],
    [Markup.button.callback('💘 Пульт FD', 'admin_fd_panel')],
    [Markup.button.callback('🧠 Пульт Stock', 'admin_stock_list')],
    [Markup.button.callback('🥂 Пульт Talk', 'admin_talk_panel')],
    [Markup.button.callback('📊 Статистика', 'admin_stats')]
  ], { columns: 2 }));
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
    await autoCloseEvent(parseInt(ctx.match[1])); 
    ctx.editMessageText(`✅ Закрыто.`);
});

// Рассылка
bot.action('admin_broadcast_start', (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    ctx.reply('📢 Введите текст рассылки.');
    // @ts-ignore
    ctx.session = { waitingForBroadcast: true };
    ctx.answerCbQuery();
});

// Пульт Talk & Toast
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
    const btns = STOCK_QUESTIONS.map((_, i) => [Markup.button.callback(`Q${i+1}`, `stock_manage_${i}`)]);
    // Разбиваем кнопки по 3 в ряд для компактности
    const rows = [];
    for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
    rows.push([Markup.button.callback('🔙 В меню', 'panel')]);
    
    ctx.editMessageText('🧠 <b>Выберите вопрос:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});
bot.action(/stock_manage_(\d+)/, (ctx) => {
    const i = parseInt(ctx.match[1]);
    const q = STOCK_QUESTIONS[i];
    STOCK_STATE.currentQuestionId = i;
    const icon = STOCK_STATE.isActive ? '🟢' : '🔴';
    ctx.editMessageText(`❓ <b>Раунд ${i+1}:</b>\n"${q.q}"\n\nОтвет: <tg-spoiler>${q.a}</tg-spoiler>\nСтатус: ${icon}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
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

// Помощник для рассылки (Stock)
const broadcastToPlayers = async (ctx: any, text: string, type: string) => {
    try {
        const event = await db.query.events.findFirst({ where: (e, {and, eq}) => and(eq(e.type, type), eq(e.isActive, true)), orderBy: (e, {desc}) => [desc(e.id)] });
        if (!event) return ctx.reply(`❌ Нет активной игры.`);
        await broadcastToEvent(event.id, text);
        ctx.reply(`✅ Отправлено.`);
    } catch { ctx.reply('Ошибка рассылки.'); }
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
    ctx.reply('Введите номера через пробел (2 5).');
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
    if (!m) return ctx.reply('/add type date desc max');
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
        const user = ctx.from;
        // @ts-ignore
        await bot.telegram.sendMessage(ADMIN_ID, `🧠 Ответ: "${ctx.message.text}" от ${user.first_name}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🏆 Объявить победителем', `stock_win_${ctx.from.id}`)]])});
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
        await ctx.telegram.sendMessage(ADMIN_ID, `🆘 ${ctx.from.first_name} (ID ${ctx.from.id}):\n${ctx.message.text}\n⬇️ /reply ${ctx.from.id} txt`);
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
