import { Telegraf, Markup, session, Scenes } from 'telegraf';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, or, inArray, and } from 'drizzle-orm'; // Добавил 'and' здесь
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

// Сокращенные идентификаторы типов игр для кнопок (лимит 64 байта)
const TYPE_MAP: Record<string, string> = {
  'talk_toast': 'tt',
  'stock_know': 'sk',
  'speed_dating': 'sd'
};
const REV_TYPE_MAP: Record<string, string> = {
  'tt': 'talk_toast',
  'sk': 'stock_know',
  'sd': 'speed_dating'
};

// --- 2. КОНТЕНТ ---

const MINI_GAMES_TEXT = `🎮 <b>4 Мини-игры для разминки:</b>

1. <b>«Две правды, одна ложь»</b>
Каждый по очереди называет 3 факта о себе. Два правдивых, один выдуманный. Остальные голосуют, пытаясь угадать ложь.

2. <b>«Я никогда не...»</b>
Выставьте 5 пальцев. По очереди говорите то, что вы никогда не делали. Те, кто это ДЕЛАЛ — загибают палец.

3. <b>«Кто скорее всего?»</b>
Каждый по очереди задает вопрос: "Кто скорее всего проспит работу?". На счет три все указывают пальцем на человека за столом.

4. <b>«Контакт»</b>
Один загадывает слово (первую букву). Другие задают наводящие вопросы.`;

const CONVERSATION_TOPICS = [
  "Если бы ты мог/ла пригласить кого-нибудь на ужин, кого бы ты выбрал/а?",
  "Хотел был/а ты быть знаменитым/ой? Если да, то чем?",
  "Прежде чем сделать звонок, ты репетируешь свою реплику?",
  "Каким был бы для тебя «идеальный день»?",
  "Когда ты в последний раз пел/а в одиночестве?",
  "Если бы ты мог/ла прожить до 100 лет, сохранив разум или тело 30-летнего, что бы выбрал/а?",
  "У тебя есть тайное предчувствие того, как ты умрешь?",
  "Назови три черты, которые есть и у тебя, и у твоего партнера.",
  "За что ты испытываешь наибольшую благодарность?",
  "Если бы ты мог, что бы ты изменил/а в воспитании?",
  "За 3 минуты расскажи историю твоей жизни.",
  "Если бы ты мог/ла проснуться с новым умением, что бы это было?",
  "Если бы магический кристалл мог открыть правду, о чем бы ты узнал?",
  "Есть ли что-то, что ты давно мечтаешь сделать?",
  "Самое большое достижение в твоей жизни?",
  "Что в дружбе для тебя наиболее ценно?",
  "Какое твое самое дорогое воспоминание?",
  "А самое ужасное воспоминание?",
  "Если бы ты знал, что умрешь через год, что бы ты изменил?",
  "Что для тебя значит дружба?",
  "Какую роль любовь и нежность играют в твоей жизни?",
  "По очереди называйте положительные черты собеседника.",
  "В твоей семье отношения теплые и близкие?",
  "Что ты чувствуешь в связи с твоими отношениями с матерью?",
  "Составьте три утверждения «мне кажется мы оба...»",
  "Продолжите фразу: «Я бы хотел, чтобы был кто-то, с кем можно разделить…»",
  "Если бы ты стал близким другом для кого-то, что бы ты ему рассказал?",
  "Расскажи партнеру, что тебе в нем нравится (честно).",
  "Поделитесь смущающим моментом из жизни.",
  "Когда ты в последний раз плакал?",
  "Что ты ценишь в людях?",
  "Какая тема слишком серьезна для шуток?",
  "Если бы ты исчез сегодня, о чем несказанном жалел бы?",
  "Дом горит. Что спасешь (кроме живых существ)?",
  "Что в этом году случилось впервые?",
  "Какие качества ты любишь и ненавидишь в себе?",
  "Что для Вас значит слово успех?",
  "Что бы вы сказали себе 15-летнему?",
  "О чём вы можете говорить часами?",
  "Какой лучший совет Вам давали?",
  "Без чего не проживаете ни дня?",
  "Кем ты работаешь? Расскажи неочевидный факт.",
  "Если бы пришлось есть одно блюдо всю жизнь?",
  "Твой «Бесполезный талант»?",
  "Что популярно, но тебя бесит?",
  "Место, которое разочаровало? И куда хочешь вернуться?",
  "Роли в зомби-апокалипсисе: лидер, предатель, первая жертва?",
  "100 млн долларов, но нельзя тратить на себя. Куда денешь?",
  "Путешествие во времени на 1 час (только смотреть). Куда?",
  "Еда или запах детства?",
  "Кем мечтал стать в 7 лет?",
  "За что тебя выгоняли из класса?",
  "Неделя без смартфона за миллион?",
  "Кот или собака? Продай мне выбор."
];

// --- HELPERS (Вспомогательные функции) ---
const encodeCat = (str: string) => Buffer.from(str).toString('base64').replace(/=/g, '');
const decodeCat = (str: string) => Buffer.from(str, 'base64').toString('utf-8');

const parseEventDesc = (desc: string | null) => {
  if (!desc) return { title: 'Мероприятие', address: 'Уточняется' };
  const parts = desc.split('###');
  return { 
    title: parts[0].trim(), 
    address: parts[1] ? parts[1].trim() : 'Секретная локация 🔒' 
  };
};

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

      // 1. ЗА 3 ДНЯ (72 часа)
      if (diffHours >= 71.5 && diffHours <= 72.5) {
        const actionId = `remind_3d_${event.id}`;
        if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
          PROCESSED_AUTO_ACTIONS.add(actionId);
          await broadcastToEvent(event.id, 
            `📅 <b>Скоро игра!</b>\n\nНапоминаем, что через 3 дня (${start.toFormat('dd.MM')}) состоится игра "${event.type}".\n\nГотовьтесь к классному вечеру! 🥂`
          );
        }
      }

      // 2. ЗА 24 ЧАСА
      if (diffHours >= 23.5 && diffHours <= 24.5) {
        const actionId = `remind_24h_${event.id}`;
        if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
          PROCESSED_AUTO_ACTIONS.add(actionId);
          await broadcastToEvent(event.id, 
            `🔔 <b>Уже завтра!</b>\n\nЖдем вас в ${start.toFormat('HH:mm')} на игре.\n📍 Адрес мы пришлем за 3 часа до начала.`
          );
        }
      }

      // 3. РАСКРЫТИЕ МЕСТА (За 3 ЧАСА)
      if (diffHours >= 2.8 && diffHours <= 3.2) {
        const actionId = `reveal_place_${event.id}`;
        if (!PROCESSED_AUTO_ACTIONS.has(actionId)) {
          PROCESSED_AUTO_ACTIONS.add(actionId);
          const { address } = parseEventDesc(event.description);
          await broadcastToEvent(event.id, 
            `📍 <b>Место встречи открыто!</b>\n\nДо игры осталось 3 часа.\nМы встречаемся здесь:\n<b>${address}</b>\n\nЖдем вас! Пожалуйста, не опаздывайте.`
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
  await broadcastToEvent(eventId, `🔔 <b>Викторина для всех!</b> Угадываем факты друг о друге.`);
  await delay(5000);
  const shuffled = bookings.sort(() => 0.5 - Math.random()).slice(0, 3);
  for (const booking of shuffled) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, booking.userId) });
    if (!user) continue;
    const fact = (user.fact && user.fact.length > 2) ? user.fact : user.strangeStory;
    if (!fact) continue;
    await broadcastToEvent(eventId, `❓ <b>Как думаете, чей это факт?</b>\n"${fact}"`);
    await delay(30000); 
    await broadcastToEvent(eventId, `🔓 <b>Это:</b> ${user.name}!`);
    await delay(5000);
  }
  await broadcastToEvent(eventId, `🏁 Игра окончена! Спасибо всем, обменяйтесь контактами если того хотите, не бойтесь спрашивать, мы тут для знакомств!`);
}

async function autoCloseEvent(eventId: number) {
  await db.update(schema.events).set({ isActive: false }).where(eq(schema.events.id, eventId));
  const bookings = await db.query.bookings.findMany({ where: (b, {and, eq}) => and(eq(b.eventId, eventId), eq(b.paid, true)) });
  for (const b of bookings) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
    if (u) {
        await db.update(schema.users).set({ gamesPlayed: (u.gamesPlayed||0)+1 }).where(eq(schema.users.id, u.id));
        bot.telegram.sendMessage(u.telegramId, '🎁 Игра закрыта, мы добавили Вам +1 балл лояльности! (каждая 5-ая игра бесплатно)').catch(()=>{});
    }
  }
}

// --- 6. РЕГИСТРАЦИЯ И МЕНЮ ---

const registerScene = new Scenes.WizardScene('REGISTER_SCENE',
  async (ctx) => { 
      ctx.reply(`👋 Привет! Добро пожаловать в наш клуб знакомств, общения и интересных встреч.

Здесь мы создаём пространство, где люди находят друзей, партнёров, единомышленников и просто приятно проводят время.

Пока что у нас три формата мероприятий — от уютных ужинов🍝 до быстрых мини-свиданий💗 и интеллектуальных игр.🧠

Чтобы мы могли подобрать для тебя лучший опыт и корректно забронировать места, давай сначала немного познакомимся☺️

⏱️ Регистрация проходит один раз и навсегда — всего 5 коротких вопросов, это займёт около минуты. 

Не задумывайся и отвечай быстро.

Готов начать?⚡️

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
    // @ts-ignore
    const referrerId = ctx.wizard.state.referrerId || null;

    await db.insert(schema.users).values({
      telegramId: ctx.from.id, 
      username: ctx.from.username, 
      firstName: ctx.from.first_name,
      name: data.name, 
      birthDate: data.birthDate, 
      fact: data.fact, 
      strangeStory: data.story, 
      gender: gender, 
      isAdmin: ctx.from.id === ADMIN_ID,
      invitedBy: referrerId
    });

    if (referrerId) {
        bot.telegram.sendMessage(referrerId, `👋 По вашей ссылке зарегистрировался новый участник! Вы получите бонус, когда он купит первый билет.`).catch(()=>{});
    }

    ctx.reply('✅ Регистрация завершена успешно! Добро пожаловать, выбирай игру и становись частью нашего Алгоритма.', getMainKeyboard());
    return ctx.scene.leave();
  }
);
stage.register(registerScene);

function getMainKeyboard() { return Markup.keyboard([['🎮 Игры', '👤 Личный кабинет'], ['🆘 Помощь', '📜 Правила']]).resize(); }

bot.start(async (ctx) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
  
  if (user) {
      return ctx.reply(`С возвращением, ${user.name}!`, getMainKeyboard());
  }

  const startPayload = ctx.message.text.split(' ')[1]; 
  let referrerId = 0;

  if (startPayload && startPayload.startsWith('ref_')) {
      const refId = parseInt(startPayload.replace('ref_', ''));
      if (!isNaN(refId) && refId !== ctx.from.id) {
          referrerId = refId;
      }
  }

  ctx.scene.enter('REGISTER_SCENE', { referrerId });
});

bot.hears('🎮 Игры', (ctx) => {
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([
    [Markup.button.callback('Talk & Toast 🥂', 'game_talk')],
    [Markup.button.callback('Stock & Know 🧠', 'game_stock')],
    [Markup.button.callback('Быстрые свидания 💘', 'game_dating')],
    [Markup.button.callback('✖️ Скрыть меню', 'close_menu')] 
  ]));
});

bot.action('close_menu', (ctx) => {
  ctx.deleteMessage();
});

bot.hears('👤 Личный кабинет', async (ctx) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
  if (!user) return ctx.reply('Пройдите регистрацию /start');
  
  const gamesLeft = 5 - (user.gamesPlayed % 5);

  ctx.reply(
    `👤 *Личный кабинет*\n\n👤 Имя: ${user.name}\n🎂 ДР: ${user.birthDate}\n🎲 Игр сыграно: ${user.gamesPlayed}\n🎁 До бесплатной игры: ${gamesLeft}`,
    { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🗣 Пригласить друга (+1 балл)', 'invite_friend')], 
            [Markup.button.callback('📅 Мои билеты', 'my_games')], 
            [Markup.button.callback('🎟 У меня есть ваучер', 'upload_voucher')]
        ]) 
    }
  );
});

bot.action('invite_friend', async (ctx) => {
    const botUser = await bot.telegram.getMe();
    const refLink = `https://t.me/${botUser.username}?start=ref_${ctx.from.id}`;

    ctx.reply(
        `📢 *Ваша реферальная ссылка:*\n\n\`${refLink}\`\n\nОтправь эту ссылку другу. Если он зарегистрируется и купит билет, тебе засчитается +1 игра (как будто ты сходил)!`,
        { parse_mode: 'Markdown' }
    );
    ctx.answerCbQuery();
});

bot.hears('📜 Правила', (ctx) => {
    ctx.reply(
        '📜 <b>Правила клуба Allgorithm</b>\n\n' +
        '<b>🔻 ОБЩИЕ ПРАВИЛА:</b>\n' +
        '1. <b>18+:</b> Строго для совершеннолетних. Врать про возраст — ваша ответственность.\n' +
        '2. <b>Честная игра:</b> Без обмана, гугла и мухлежа. Мы здесь за чилом!\n' +
        '3. <b>Культура:</b> Мат, спам и оскорбления = бан без разговоров.\n' +
        '4. <b>Оплата:</b> Нет оплаты — нет регистрации.(нету ручек - нет конфетки) Платеж — ваш входной билет.\n' +
        '5. <b>Администрация:</b> Слово ведущего — закон. Можем удалить за нарушение без возврата средств.\n\n' +
        '<b>🔻 ВОЗВРАТ СРЕДСТВ:</b>\n' +
        '1. <b>За 36 часов:</b> Предупредите за 36 часов — вернем деньги.\n' +
        '2. <b>Менее 36 часов:</b> Деньги не возвращаются.\n' +
        '3. <b>Отмена игры:</b> Если отменим мы — вернем всем.\n\n' +
        '<b>🔻 ПРАВИЛА ПОВЕДЕНИЯ:</b>\n' +
        '1. <b>Тайминг:</b> Приходите за 10-15 минут до, чтобы заказать еду.\n' +
        '2. <b>Еда и Напитки:</b> Оплата за заказы в ресторане производится на месте отдельно.\n' +
        '3. <b>Тишина:</b> Не болтать во время объяснения правил.\n' +
        '4. <b>Без советов:</b> Не перебивайте ведущих. Все жалобы и советы — в конце вечера.\n' +
        '5. <b>Атмосфера:</b> Оставляем неуместные комментарии и душноту дома. Если вопрос не нравится — это часть игры.',
        { parse_mode: 'HTML' }
    );
});

bot.hears('🆘 Помощь', (ctx) => { ctx.reply('Напиши свой вопрос админу следующим сообщением.'); 
// @ts-ignore
ctx.session = { waitingForSupport: true }; });

// --- 7. ЛОГИКА ИГР ---

// 1. TALK & TOAST
bot.action('game_talk', (ctx) => {
  ctx.editMessageText(
      `🥂 <b>Talk & Toast</b>\n\n` +
      `<b>Что это?</b>\n` +
      `Мы собираем до 8 интересных людей за одним столом, чтобы пообщаться по-настоящему. Мы задействуем уникальную механику общения, которая заменяет «small talk» на искренность, а незнакомцы за один вечер становятся близкими по духу людьми ✨\n\n` +
      `<b>Как это проходит?</b>\n` +
      `• <b>Уникальная механика:</b> Наш бот-модератор подкидывает необычные темы — от абсурдно смешных историй до глубоких инсайтов.\n` +
      `• <b>Никаких пауз:</b> Механика игры сама ведет диалог, позволяя узнать друг друга глубже, чем за годы обычного знакомства.\n` +
      `• <b>Атмосфера:</b> Ужины проходят в лучших ресторанах города в максимально приятной и расслабленной компании 🍝\n\n` +
      `<b>Зачем идти?</b>\n` +
      `• Найти новых друзей, деловых партнёров или даже вторую половинку 🤝\n` +
      `• Открыть для себя новый ресторан и попробовать необычные блюда.\n` +
      `• Получить яркие впечатления и новый круг общения, с которым вы бы никогда не встретились в обычной жизни 🌍\n\n` +
      `🍲 <b>Важно:</b> Еда и напитки оплачиваются отдельно по меню ресторана.`,
      { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Записаться', 'book_talk')],
            [Markup.button.callback('🎲 Попробовать темы', 'get_random_topic')],
            [Markup.button.callback('🎮 4 Мини-игры', 'talk_mini_games')],
            [Markup.button.callback('🔙 Назад к играм', 'back_to_games')]
          ])
      }
  );
});

bot.action('get_random_topic', async (ctx) => {
  const topic = CONVERSATION_TOPICS[Math.floor(Math.random() * CONVERSATION_TOPICS.length)];
  await ctx.reply(`🎲 *Тема:* "${topic}"`, { parse_mode: 'Markdown' });
  await ctx.answerCbQuery(); 
});

bot.action('talk_mini_games', async (ctx) => {
    await ctx.reply(MINI_GAMES_TEXT, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
});

bot.action('book_talk', async (ctx) => bookGame(ctx, 'talk_toast'));

// 2. STOCK & KNOW
bot.action('game_stock', (ctx) => {
  ctx.editMessageText(
      `🧠 <b>Stock & Know</b>\n\n` +
      `<b>Что это?</b>\n` +
      `Интеллектуальная игра, где ставят на знания! 🎓 Здесь важно не только содержание вашего багажа знаний, но и умение уверенно делать ставки. Это остроумная битва, где сплетены искусство блефа и эрудиция 🎭\n\n` +
      `<b>Зачем это?</b>\n` +
      `• Шанс найти новые знакомства без фильтров 👀\n` +
      `• Незабываемые эмоции от командной игры 🔥\n` +
      `• Проверка знаний, удачи и остроумия 🍀\n` +
      `• Расширение кругозора 🌍\n\n` +
      `<b>Как работает?</b>\n` +
      `В начале раунда все делают обязательную ставку 💰. Ведущий задает вопрос, вы записываете ответ (менять нельзя!). Затем, в зависимости от азарта, вы можете повышать ставки (даже ва-банк!). Ведущий дает 3 подсказки 💡 — после каждой можно менять ставку. Побеждает тот, кто ближе всех к истине!\n\n` +
      `⏳ <b>Время:</b> 2 часа\n` +
      `👥 <b>Игроков:</b> до 8\n` +
      `🍲 <b>Меню:</b> Еда и напитки оплачиваются отдельно`,
      { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Записаться', 'book_stock')], 
            [Markup.button.callback('🔙 Назад', 'back_to_games')]
          ]) 
      }
  );
});

bot.action('book_stock', async (ctx) => bookGame(ctx, 'stock_know'));

// 3. FAST DATES
bot.action('game_dating', (ctx) => {
  ctx.editMessageText(
      `💘 <b>Быстрые свидания</b>\n\n` +
      `<b>Что это?</b>\n` +
      `14 человек (7Ж + 7М), 7 столиков, 10-минутные раунды. Бот выдаёт номера, запускает таймер и тусует пары. Вы отмечаете симпатии — если мэтч, бот пришлёт контакты 💌\n\n` +
      `<b>Зачем это?</b>\n` +
      `🔥 Семь шансов на знакомство за час: одна искра — и это тот самый человек.\n` +
      `🗣 Без неловких моментов — бот подскажет тему.\n` +
      `✅ Только мэтчи: уходишь с реальными контактами.\n` +
      `🛡 Безопасно: не понравился человек — он не получит твой контакт.\n\n` +
      `<b>Как это работает?</b>\n` +
      `Испытайте искру с первого взгляда! Мужчины и женщины садятся по двое. Каждые 10 минут пары меняются 🔄. В конце вы отмечаете в карточке тех, кто понравился. Если чувства взаимны — бот соединит вас! 💕\n\n` +
      `⏳ <b>Время:</b> 1 ч 15 мин\n` +
      `👥 <b>Участников:</b> 14\n` +
      `🍹 <b>Бар:</b> Напитки и еда оплачиваются отдельно`,
      { 
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Записаться', 'book_dating')], 
            [Markup.button.callback('🔙 Назад', 'back_to_games')]
          ]) 
      }
  );
});

bot.action('book_dating', async (ctx) => bookGame(ctx, 'speed_dating'));

// Функция отображения категорий (Группировка)
async function bookGame(ctx: any, type: string) {
  const events = await db.query.events.findMany({ 
    where: (e, { eq, and }) => and(eq(e.type, type), eq(e.isActive, true)) 
  });

  if (events.length === 0) {
    const text = `Расписание на этот формат сейчас формируется! 🗓\n\nСледите за анонсами в Instagram.`;
    return ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('📸 Инстаграм', 'https://www.instagram.com/algorythm.pl/')],
        [Markup.button.callback('🔙 Назад к играм', 'back_to_games')]
      ])
    });
  }

  const uniqueTitles = new Set<string>();
  events.forEach(e => {
    const { title } = parseEventDesc(e.description);
    uniqueTitles.add(title);
  });

  const buttons: any[] = [];
  uniqueTitles.forEach(title => {
    buttons.push([Markup.button.callback(title, `cv_${TYPE_MAP[type]}_${encodeCat(title)}`)]);
  });

  buttons.push([Markup.button.callback('🔙 Назад', 'back_to_games')]);

  ctx.editMessageText('👇 <b>Выберите формат/кухню:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
}

// Обработчик выбора категории (вывод дат)
bot.action(/cv_(.+)_(.+)/, async (ctx) => {
  const shortType = ctx.match[1];
  const type = REV_TYPE_MAP[shortType];
  const encodedTitle = ctx.match[2];
  const selectedTitle = decodeCat(encodedTitle);

  const events = await db.query.events.findMany({ 
    where: (e, { eq, and }) => and(eq(e.type, type), eq(e.isActive, true)) 
  });

  const filteredEvents = events.filter(e => {
    const { title } = parseEventDesc(e.description);
    return title === selectedTitle;
  });

  if (filteredEvents.length === 0) return ctx.reply('Свободные слоты закончились :(');

  const buttons = filteredEvents.map(e => [
    Markup.button.callback(
      `📅 ${e.dateString} (${e.currentPlayers}/${e.maxPlayers})`, 
      `pay_event_${e.id}`
    )
  ]);
  
  buttons.push([Markup.button.callback('🔙 Назад', `back_to_cats_${shortType}`)]);

  ctx.editMessageText(`🍝 <b>${selectedTitle}</b>\nВыберите удобную дату:`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action(/back_to_cats_(.+)/, async (ctx) => {
  const type = REV_TYPE_MAP[ctx.match[1]];
  await bookGame(ctx, type);
});

bot.action('back_to_games', (ctx) => {
  ctx.deleteMessage();
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([[Markup.button.callback('Talk & Toast 🥂', 'game_talk')], [Markup.button.callback('Stock & Know 🧠', 'game_stock')], [Markup.button.callback('Fast Dates 💘', 'game_dating')]]));
});

// ИСПРАВЛЕННЫЙ MY_GAMES (Ошибка Drizzle исправлена)
bot.action('my_games', async (ctx) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
    if (!user) return;
    const now = DateTime.now();

    // Получаем записи, включая ID самой записи (bid) и ID события (eid)
    const myBookings = await db
      .select({ 
        bid: schema.bookings.id,
        eid: schema.events.id,
        t: schema.events.type, 
        d: schema.events.dateString, 
        desc: schema.events.description 
      })
      .from(schema.bookings)
      .innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id))
      .where(
        and(
          eq(schema.bookings.userId, user.id),
          eq(schema.bookings.paid, true),
          eq(schema.events.isActive, true)
        )
      );

    if (myBookings.length === 0) {
        await ctx.answerCbQuery();
        return ctx.reply('📭 У вас нет активных записей.');
    }
    
    await ctx.reply('📅 <b>Ваши активные билеты:</b>', { parse_mode: 'HTML' });

    for (const b of myBookings) {
        const start = DateTime.fromFormat(b.d, "dd.MM.yyyy HH:mm");
        const diffHours = start.diff(now, 'hours').hours;
        const { title, address } = parseEventDesc(b.desc);
        
        let locationDisplay = address;
        if (diffHours > 3.2) {
            locationDisplay = "🔒 <i>Секретная локация (откроется за 3 часа)</i>";
        }

        let msg = `🗓 <b>${b.d}</b> | ${title}\n📍 ${locationDisplay}`;
        
        const buttons = [];
        // ПРАВИЛО 36 ЧАСОВ: показываем кнопку только если времени достаточно
        if (diffHours >= 36) {
            buttons.push([Markup.button.callback('❌ Отменить запись', `conf_canc_${b.bid}`)]);
        }

        await ctx.reply(msg, { 
            parse_mode: 'HTML', 
            ...Markup.inlineKeyboard(buttons) 
        });
    }
    ctx.answerCbQuery();
});

// 1. Шаг подтверждения
bot.action(/conf_canc_(\d+)/, async (ctx) => {
    const bookingId = parseInt(ctx.match[1]);
    ctx.editMessageReplyMarkup({
        inline_keyboard: [
            [Markup.button.callback('🔥 ДА, ОТМЕНИТЬ', `exec_canc_${bookingId}`)],
            [Markup.button.callback('🔙 Оставить как есть', 'my_games')]
        ]
    });
    ctx.answerCbQuery('Вы уверены?');
});

// 2. Шаг выполнения отмены
bot.action(/exec_canc_(\d+)/, async (ctx) => {
    const bookingId = parseInt(ctx.match[1]);
    
    try {
        const booking = await db.query.bookings.findFirst({ 
            where: eq(schema.bookings.id, bookingId) 
        });
        
        if (!booking) return ctx.reply('Запись не найдена.');

        const event = await db.query.events.findFirst({ 
            where: eq(schema.events.id, booking.eventId) 
        });

        if (!event) return ctx.reply('Событие не найдено.');

        const now = DateTime.now();
        const start = DateTime.fromFormat(event.dateString, "dd.MM.yyyy HH:mm");
        
        // Проверка 36 часов
        if (start.diff(now, 'hours').hours < 36) {
            return ctx.editMessageText('⚠️ Слишком поздно. По правилам клуба отмена через бота возможна только за 36 часов.');
        }

        // --- ЛОГИКА ВОЗВРАТА ВАУЧЕРА (ВКЛЮЧАЯ FULL FREE) ---
        const usedVoucher = await db.query.vouchers.findFirst({
            where: and(
                eq(schema.vouchers.userId, booking.userId),
                eq(schema.vouchers.status, 'used')
            ),
            orderBy: (v, { desc }) => [desc(v.id)]
        });

        let restoredStatus = null;
        if (usedVoucher) {
            // Если была прикреплена фотография, значит это был ваш Фулл Фри (approved_free)
            // Если фотографии нет, значит это была скидка 10 PLN через Stripe
            restoredStatus = usedVoucher.photoFileId ? 'approved_free' : 'approved_10';
            
            await db.update(schema.vouchers)
                .set({ status: restoredStatus })
                .where(eq(schema.vouchers.id, usedVoucher.id));
        }

        // Удаляем бронь и освобождаем место
        await db.delete(schema.bookings).where(eq(schema.bookings.id, bookingId));
        await db.update(schema.events)
            .set({ currentPlayers: Math.max(0, (event.currentPlayers || 0) - 1) })
            .where(eq(schema.events.id, event.id));

        // --- СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЮ ---
        let responseMsg = '✅ <b>Запись успешно отменена.</b>\n\n';

        if (restoredStatus === 'approved_free') {
            responseMsg += '🎁 <b>Ваш Full Free ваучер возвращен!</b>\nОн снова активен, и вы можете использовать его для записи на любую другую игру. Просто выберите новую дату.';
        } else if (restoredStatus === 'approved_10') {
            responseMsg += '🎫 <b>Скидка 10 PLN восстановлена!</b>\nВаш ваучер снова активен. При следующей записи скидка применится автоматически.';
        } else {
            responseMsg += '💰 <b>Для возврата средств:</b>\nВаша запись удалена. Пожалуйста, напишите администратору через кнопку <b>«🆘 Помощь»</b>, чтобы мы оформили возврат в Stripe.';
        }
        
        await ctx.editMessageText(responseMsg, { parse_mode: 'HTML' });

        // Уведомление админу
        const adminLog = restoredStatus 
            ? `♻️ Ваучер (${restoredStatus === 'approved_free' ? 'FULL FREE' : '-10 PLN'}) возвращен пользователю.` 
            : `💸 Нужно оформить ручной Refund в Stripe.`;

        bot.telegram.sendMessage(ADMIN_ID, 
            `⚠️ <b>ОТМЕНА ЗАПИСИ</b>\n\n` +
            `Пользователь: ${ctx.from.first_name} (@${ctx.from.username})\n` +
            `Игра: ${event.dateString} (${event.type})\n` +
            `Статус: ${adminLog}`, 
            { parse_mode: 'HTML' }
        );

    } catch (e) {
        console.error('Cancellation Error:', e);
        ctx.reply('Произошла ошибка при отмене. Попробуйте позже или напишите в поддержку.');
    }
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

    const gamesPlayed = user.gamesPlayed || 0;
    if ((gamesPlayed + 1) % 5 === 0) {
        const existing = await db.query.bookings.findFirst({ where: (b, { and, eq }) => and(eq(b.userId, user.id), eq(b.eventId, eventId)) });
        if (existing) return ctx.reply('✅ Вы уже записаны!');
        await db.insert(schema.bookings).values({ userId: user.id, eventId: eventId, paid: true });
        await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eventId));
        return ctx.reply('🎁 <b>Поздравляем!</b>\nЭто ваша 5-я игра, она бесплатная! 🎉', { parse_mode: 'HTML' });
    }

    const activeVoucher = await db.query.vouchers.findFirst({ 
        where: (v, { and, eq, or }) => and(
            eq(v.userId, user.id), 
            or(eq(v.status, 'approved_10'), eq(v.status, 'approved_free'))
        ) 
    });

    if (activeVoucher && activeVoucher.status === 'approved_free') {
         const existing = await db.query.bookings.findFirst({ where: (b, { and, eq }) => and(eq(b.userId, user.id), eq(b.eventId, eventId)) });
         if (existing) return ctx.reply('✅ Вы уже записаны!');
         await db.insert(schema.bookings).values({ userId: user.id, eventId: eventId, paid: true });
         await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eventId));
         await db.update(schema.vouchers).set({ status: 'used' }).where(eq(schema.vouchers.id, activeVoucher.id));
         return ctx.reply('🎫 <b>Ваучер применен!</b>\nВаше участие полностью оплачено ваучером.\n\nВы успешно записаны! Я напомню Вам заранее о участии прямо тут.', { parse_mode: 'HTML' });
    }

    const priceId = GAME_PRICES[event.type];
    if (!priceId) return ctx.reply('Ошибка: цена не настроена.');

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `https://t.me/AllgorithmBot?start=success`,
      cancel_url: `https://t.me/AllgorithmBot?start=cancel`,
      metadata: { telegramId: telegramId.toString(), eventId: eventId.toString(), voucherId: '' },
    };

    let msg = `Оплата участия: 50 PLN`;
    if (activeVoucher && activeVoucher.status === 'approved_10') {
        sessionConfig.discounts = [{ coupon: STRIPE_COUPON_ID }];
        sessionConfig.metadata!.voucherId = activeVoucher.id.toString();
        msg = `🎉 <b>Ваучер применен!</b>\nСкидка -10 PLN.\n<b>К оплате: 40 PLN</b>`;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    if (!session.url) throw new Error('No URL');
    ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('💸 Оплатить', session.url)], [Markup.button.callback('✅ Я оплатил', `confirm_pay_${eventId}`)]]) });
  } catch (e) { ctx.reply(`Ошибка Stripe: ${e}`); }
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

        if (user.invitedBy) {
            const inviter = await db.query.users.findFirst({ where: eq(schema.users.telegramId, user.invitedBy) });
            if (inviter) {
                await db.update(schema.users).set({ gamesPlayed: (inviter.gamesPlayed || 0) + 1 }).where(eq(schema.users.id, inviter.id));
                bot.telegram.sendMessage(inviter.telegramId, `🎉 <b>Реферальный бонус!</b>\n\nВаш друг ${user.name} купил билет на игру.\nВам начислен +1 балл лояльности!`, { parse_mode: 'HTML' }).catch(()=>{});
                await db.update(schema.users).set({ invitedBy: null }).where(eq(schema.users.id, user.id));
            }
        }

        const event = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
        if (event) await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eventId));

        ctx.editMessageText('🎉 Оплата подтверждена!\nВы в игре! 😎\n\nМесто встречи откроется за 3 часа. Я напомню Вам заранее об участии. Не забывай о правилах', { parse_mode: 'HTML' });
    } catch (e) { ctx.reply('Ошибка проверки.'); }
});

// --- 9. ВАУЧЕРЫ ---

bot.action('upload_voucher', (ctx) => {
    ctx.reply('📸 Отправьте фото ваучера, админу на одобрение прямо сюда.');
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
        ctx.reply('✅ Ваучер отправлен на проверку.');
        // @ts-ignore
        ctx.session.waitingForVoucher = false;
        await bot.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
            caption: `🎟 Ваучер от ${user.name}`,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('💰 -10 PLN', `voucher_set_10_${v.id}`)],
                [Markup.button.callback('🎁 FREE', `voucher_set_free_${v.id}`)],
                [Markup.button.callback('❌ Отклонить', `voucher_reject_${v.id}`)]
            ])
        });
    }
});

// 1. Одобрить скидку 10 PLN
bot.action(/voucher_set_10_(\d+)/, async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const id = parseInt(ctx.match[1]);
    
    // Обновляем статус в базе
    await db.update(schema.vouchers).set({ status: 'approved_10' }).where(eq(schema.vouchers.id, id));
    ctx.editMessageCaption('✅ Одобрено: Скидка 10 PLN.');

    // Находим пользователя, чтобы отправить уведомление
    const v = await db.query.vouchers.findFirst({ where: eq(schema.vouchers.id, id) });
    if (v) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, v.userId) });
        if (u) {
            bot.telegram.sendMessage(u.telegramId, 
                '🎉 <b>Ваш ваучер одобрен!</b>\n\n' +
                'Теперь при записи на следующую игру вам автоматически применится <b>скидка 10 PLN</b>. Ждем вас! ✨', 
                { parse_mode: 'HTML' }
            ).catch(() => {});
        }
    }
});

// 2. Одобрить БЕСПЛАТНОЕ участие (Full Free)
bot.action(/voucher_set_free_(\d+)/, async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const id = parseInt(ctx.match[1]);
    
    await db.update(schema.vouchers).set({ status: 'approved_free' }).where(eq(schema.vouchers.id, id));
    ctx.editMessageCaption('🎁 Одобрено: Бесплатное участие.');

    const v = await db.query.vouchers.findFirst({ where: eq(schema.vouchers.id, id) });
    if (v) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, v.userId) });
        if (u) {
            bot.telegram.sendMessage(u.telegramId, 
                '🎁 <b>Ура! Ваш ваучер одобрен!</b>\n\n' +
                'Вы можете записаться на любую следующую игру абсолютно <b>БЕСПЛАТНО</b>. Просто выберите удобную дату в меню. До встречи! 🥂', 
                { parse_mode: 'HTML' }
            ).catch(() => {});
        }
    }
});

// 3. Отклонить
bot.action(/voucher_reject_(\d+)/, async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const id = parseInt(ctx.match[1]);
    await db.update(schema.vouchers).set({ status: 'rejected' }).where(eq(schema.vouchers.id, id));
    ctx.editMessageCaption('❌ Отклонено.');

    const v = await db.query.vouchers.findFirst({ where: eq(schema.vouchers.id, id) });
    if (v) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, v.userId) });
        if (u) {
            bot.telegram.sendMessage(u.telegramId, 
                '😔 <b>Ваш ваучер отклонен.</b>\n\n' +
                'К сожалению, мы не смогли подтвердить ваш ваучер. Если это ошибка, пожалуйста, свяжитесь с нами через кнопку <b>«🆘 Помощь»</b>.', 
                { parse_mode: 'HTML' }
            ).catch(() => {});
        }
    }
});

// --- 10. АДМИНКА ---

// --- 10. АДМИНКА ---

bot.command('panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply('🔒 Админ-панель', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить игру', 'admin_add_event')],
    [Markup.button.callback('🗑 Удалить игру', 'admin_delete_menu')],
    [Markup.button.callback('🏁 ЗАВЕРШИТЬ ИГРУ', 'admin_close_event')], 
    [Markup.button.callback('📢 Рассылка', 'admin_broadcast_start')],
    [Markup.button.callback('📋 Записи', 'admin_bookings')],
    [Markup.button.callback('💘 Пульт FD', 'admin_fd_panel')],
    [Markup.button.callback('🧠 Пульт Stock', 'admin_stock_list')],
    [Markup.button.callback('🥂 Пульт Talk', 'admin_talk_panel')],
    [Markup.button.callback('📊 Статистика', 'admin_stats')]
  ], { columns: 2 }));
});

// 1. СТАТИСТИКА И ЗАПИСИ
bot.action('admin_stats', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const users = await db.query.users.findMany();
    const paid = await db.query.bookings.findMany({ where: eq(schema.bookings.paid, true) });
    ctx.editMessageText(`📊 Пользователей: ${users.length}\n💰 Билетов продано: ${paid.length}`, 
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'panel')]]));
});

bot.action('admin_bookings', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const res = await db.select({ 
      e: schema.events.type, 
      d: schema.events.dateString, 
      u: schema.users.name, 
      nick: schema.users.username 
    }).from(schema.bookings)
      .innerJoin(schema.users, eq(schema.bookings.userId, schema.users.id))
      .innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id))
      .where(eq(schema.bookings.paid, true));

    let msg = '📋 <b>Список всех записей:</b>\n\n';
    res.forEach(r => msg += `🔹 ${r.d} [${r.e}]: ${r.u} (@${r.nick})\n`);
    ctx.reply(msg, { parse_mode: 'HTML' });
    ctx.answerCbQuery();
});

// 2. УПРАВЛЕНИЕ ИГРАМИ (УДАЛЕНИЕ / ЗАВЕРШЕНИЕ)
bot.action('admin_delete_menu', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const active = await db.query.events.findMany({ where: eq(schema.events.isActive, true) });
    const btns = active.map(e => [Markup.button.callback(`❌ ${e.dateString} (${e.type})`, `delete_event_${e.id}`)]);
    ctx.editMessageText('Какую игру отменить?', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'panel')]]));
});

bot.action(/delete_event_(\d+)/, async (ctx) => {
    const eid = parseInt(ctx.match[1]);
    await db.update(schema.events).set({ isActive: false }).where(eq(schema.events.id, eid));
    ctx.editMessageText('✅ Игра успешно удалена из расписания.');
});

bot.action('admin_close_event', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const active = await db.query.events.findMany({ where: eq(schema.events.isActive, true) });
    const btns = active.map(e => [Markup.button.callback(`🏁 ${e.dateString} (${e.type})`, `close_confirm_${e.id}`)]);
    ctx.editMessageText('Какую игру закрыть (начислить баллы)?', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'panel')]]));
});

bot.action(/close_confirm_(\d+)/, async (ctx) => {
    await autoCloseEvent(parseInt(ctx.match[1])); 
    ctx.editMessageText(`✅ Игра закрыта. Баллы участникам начислены.`);
});

// 3. ПУЛЬТЫ УПРАВЛЕНИЯ (FD, STOCK, TALK)
bot.action('admin_fd_panel', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const event = await db.query.events.findFirst({ where: (e, {and, eq}) => and(eq(e.type, 'speed_dating'), eq(e.isActive, true)) });
    if (!event) return ctx.reply('Нет активной игры Speed Dating.');
    ctx.editMessageText(`💘 <b>Speed Dating:</b> ${event.dateString}\nУчастников: ${FAST_DATES_STATE.participants.size}`, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('1️⃣ Загрузить участников', `fd_load_${event.id}`)],
        [Markup.button.callback('2️⃣ Следующий раунд 🔄', 'fd_next_round')],
        [Markup.button.callback('3️⃣ Ввод карточек ✍️', 'fd_input_menu')],
        [Markup.button.callback('4️⃣ Расчет мэтчей 🏁', 'fd_calc_matches')],
        [Markup.button.callback('🔙 Назад', 'panel')]
    ])});
});

bot.action('admin_talk_panel', async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const event = await db.query.events.findFirst({ where: (e, {and, eq}) => and(eq(e.type, 'talk_toast'), eq(e.isActive, true)) });
    if (!event) return ctx.reply('Нет активной игры Talk & Toast.');
    ctx.editMessageText(`🥂 <b>Talk & Toast:</b> ${event.dateString}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback('🎲 Загадать факт', `talk_gen_fact_${event.id}`)],
            [Markup.button.callback('🔙 Назад', 'panel')]
        ])
    });
});

bot.action('admin_stock_list', (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    const btns = STOCK_QUESTIONS.map((_, i) => [Markup.button.callback(`Вопрос Q${i+1}`, `stock_manage_${i}`)]);
    const rows = [];
    for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3).flat());
    rows.push([Markup.button.callback('🔙 Назад', 'panel')]);
    ctx.editMessageText('🧠 <b>Выберите вопрос для игры:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

// 4. ДОБАВЛЕНИЕ И РАССЫЛКА
bot.action('admin_broadcast_start', (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    ctx.reply('📢 Отправьте текст для общей рассылки (всем пользователям бота).');
    // @ts-ignore
    ctx.session = { waitingForBroadcast: true };
    ctx.answerCbQuery();
});

bot.action('admin_add_event', (ctx) => {
  ctx.reply(
    '🗓 <b>Инструкция по добавлению:</b>\n\n' +
    'Используй команду:\n' +
    '<code>/add [тип] [дата] [мест] [Название ### Адрес]</code>\n\n' +
    'Пример:\n' +
    '<code>/add talk_toast 20.01.2026_19:00 8 Азиатский ужин 🍣 ### Ресторан Uki Uki, Krucza 23</code>',
    { parse_mode: 'HTML' }
  );
});

bot.command('add', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const parts = ctx.message.text.split(' ');
    if (parts.length < 5) return ctx.reply('❌ Ошибка формата. Используй пример из кнопки "Добавить игру".');
    const type = parts[1];
    const dateString = parts[2].replace('_', ' ');
    const maxPlayers = parseInt(parts[3]);
    const description = parts.slice(4).join(' ');
    await db.insert(schema.events).values({ type, dateString, description, maxPlayers, isActive: true });
    ctx.reply(`✅ Игра на ${dateString} успешно добавлена в базу!`);
});

bot.command('reply', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const [_, uid, ...txt] = ctx.message.text.split(' ');
    bot.telegram.sendMessage(uid, `👮‍♂️ <b>Ответ от администратора:</b>\n\n${txt.join(' ')}`, { parse_mode: 'HTML' });
});

// --- 12. ЗАПУСК ---
// --- 12. ЗАПУСК ---
const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL; // Например: https://allgorithm-bot-1.onrender.com

if (WEBHOOK_URL) {
  // Режим Webhook для Render
  bot.launch({
    webhook: {
      domain: WEBHOOK_URL,
      port: PORT,
    },
  }).then(() => {
    console.log(`🚀 Bot is running on Webhook: ${WEBHOOK_URL}`);
  });
} else {
  // Режим Polling для локальной разработки
  bot.launch().then(() => {
    console.log('🛠 Bot is running on Polling (local)');
  });
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
