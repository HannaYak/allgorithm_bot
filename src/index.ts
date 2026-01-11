import { Telegraf, Markup, session, Scenes } from 'telegraf';
import express from 'express';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, or, inArray, and, desc } from 'drizzle-orm';
import * as schema from '../drizzle/schema'; 
import 'dotenv/config';
import Stripe from 'stripe';
import { DateTime } from 'luxon';


// --- 1. НАСТРОЙКИ ---

async function broadcastToEvent(eventId: number, message: string) {
  const bookings = await db.query.bookings.findMany({
    where: and(eq(schema.bookings.eventId, eventId), eq(schema.bookings.paid, true))
  });
  for (const b of bookings) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
    if (u) bot.telegram.sendMessage(u.telegramId, message, { parse_mode: 'HTML' }).catch(() => {});
  }
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is missing');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

const GAME_PRICES: Record<string, string> = {
  'talk_toast': 'price_1SUTjrHhXyjuCWwfhQ7zwxLQ', 
  'stock_know': 'price_1SUTkoHhXyjuCWwfxD89YIpP',
  'speed_dating': 'price_1SUTlVHhXyjuCWwfU1IzNMlf',
};
const STRIPE_COUPON_ID = '8RiQPzVX'; 
const ADMIN_ID = 5456905649; 
const PROCESSED_AUTO_ACTIONS = new Set<string>(); 

const TYPE_MAP: Record<string, string> = { 'talk_toast': 'tt', 'stock_know': 'sk', 'speed_dating': 'sd' };
const REV_TYPE_MAP: Record<string, string> = { 'tt': 'talk_toast', 'sk': 'stock_know', 'sd': 'speed_dating' };

// --- 2. КОНТЕНТ (ПОЛНЫЙ) ---

const MINI_GAMES_TEXT = `🎮 <b>4 Мини-игры для разминки:</b>\n\n1. <b>«Две правды, одна ложь»</b>\n2. <b>«Я никогда не...»</b>\n3. <b>«Кто скорее всего?»</b>\n4. <b>«Контакт»</b>`;

const CONVERSATION_TOPICS = [
  "Если бы ты мог/ла пригласить кого-нибудь на ужин(из мёртвых или живых), кого бы ты выбрал/а и почему?", "Хотел/а бы ты быть знаменитым/ой? Если да, то чем?", "Прежде чем сделать звонок, ты репетируешь свою реплику?", "Когда ты в последний раз пел/а в одиночестве?", "Если бы ты мог/ла прожить до 100 лет, сохранив разум или тело 30-летнего, что бы выбрал/а?", "У тебя есть тайное предчувствие того, как ты умрешь?", "Назови три черты, которые есть и у тебя, и у кого либо за столом.", "За что ты испытываешь наибольшую благодарность?", "Если бы ты мог, что бы ты изменил/а в воспитании себя?", "За 3 минуты расскажи историю своей жизни.", "Если бы ты мог/ла проснуться с новым умением, что бы это было?", "Если бы магический кристалл мог открыть правду, о чем бы ты узнал?", "Есть ли что-то, что ты давно мечтаешь сделать?", "Самое большое достижение в твоей жизни?", "Что в дружбе для тебя наиболее ценно?", "Какое твое самое дорогое воспоминание?", "Какое твое самое ужасное воспоминание?", "Если бы ты знал, что умрешь через год, что бы ты изменил?", "Что для тебя значит дружба?", "Какую роль любовь играет в твоей жизни?", "По очереди называйте положительные черты, на ваш взгляд, собеседников.", "Какие отношения в твоей семье, например близкие или отдалённые?", "Что ты чувствуешь в связи с твоими отношениями с матерью?", "Составьте три утверждения «мне кажется мы оба...» с каким либо из участников", "Продолжите фразу: «Я бы хотел, чтобы был кто-то, с кем можно разделить…»", "Если бы ты стал близким другом для кого-то, что бы ты ему рассказал?", "Расскажи участникам, что тебе в них нравится (честно).", "Поделитесь смущающим моментом из жизни.", "Когда ты в последний раз плакал и почему?", "Что ты ценишь в людях и почему?", "Какая тема слишком серьезна для шуток?", "Если бы ты исчез сегодня, о чем несказанном жалел бы?", "Дом горит. Что спасешь (кроме живых существ, документов и денег)?", "Что в этом году случилось впервые?", "Какие качества ты любишь и ненавидишь в себе?", "Что для Вас значит слово успех?", "Что бы вы сказали себе 15-летнему?", "О чём вы можете говорить часами?", "Какой лучший совет Вам давали?", "Без чего не проживаете ни дня?", "Кем ты работаешь? Расскажи неочевидный факт из профессии.", "Если бы пришлось есть одно блюдо всю жизнь, что это было бы?", "Твой «Бесполезный талант»?", "Что популярно, но тебя бесит?", "Место, которое разочаровало? И куда хочешь вернуться?", "Роли в зомби-апокалипсисе: лидер, предатель, первая жертва. Кто ты?", "100 млн долларов, но нельзя тратить на себя. Куда денешь?", "Путешествие во времени, у тебя только 1 час (можно только смотреть). Куда отправишься?", "Кем мечтал стать в 7 лет?", "За что тебя выгоняли из класса?", "Месяц без смартфона за миллион?", "Кот или собака? Продай мне выбор."
];

const STOCK_QUESTIONS = [
  { question: "Назовите, сколько всего славянских народов выделяют в современной этнологии?", hints: ["1. Ровно столько городов-героев.", "2. Ровно столько лунных циклов за год.", "3. Это число из хоррора про Джейсона."], answer: "13", fact: "Интересный факт: их 13." },
  { question: "Согласно Вавилонскому представлению о мире, он состоит именно из такого количества частей. Назовите число:", hints: ["1. Через столько столиц проходила «Ось зла».", "2. Ровно столько кружек пива заказал герой в «Бесславных ублюдках».", "3. Столько империй участвовало в трёх разделах Речи Посполитой."], answer: "3", fact: "Для вавилонян число 3 было сакральным." },
  { question: "Назовите модельный номер знаменитого самолёта «Летающая крепость», участвовавшего в ядерных бомбардировках.", hints: ["1. Расстояние Земля-Плутон (а.е.).", "2. Последние две цифры года начала Великой депрессии.", "3. Столько дней в феврале в високосный год."], answer: "29", fact: "B-29 стоил 3 млрд долларов!" },
  { question: "Сколько династий правило в Китае за всю историю?", hints: ["1. Число, от которого отталкивалась математика Майя.", "2. Столько молочных зубов у человека.", "3. Столько тысяч лье под водой."], answer: "20", fact: "Династия Чжоу правила 800 лет!" },
  { question: "В 2007 году назвали количество Новых чудес света.", hints: ["1. Столько звёзд в Большой Медведице.", "2. День в январе (Рождество).", "3. Столько футов под килем в пожелании."], answer: "7", fact: "Пирамида Хеопса — единственное старое чудо." },
  { question: "Назовите число лунных циклов между Олимпийскими играми.", hints: ["1. Золотая свадьба.", "2. Количество штатов в США.", "3. Псевдоним рэпера 50 Cent."], answer: "50", fact: "Число 50 преследует нас повсюду!" },
  { question: "Сколько родов войск обычно насчитывается в большинстве стран?", hints: ["1. Столько базовых чувств выделил Аристотель.", "2. Ровно столько постоянных членов Совбеза ООН.", "3. Число в названии фильма Люка Бессона."], answer: "5", fact: "Пятый элемент — это любовь." },
  { question: "Назовите, сколько всего человек побывало за всю историю на Лунной поверхности?", hints: ["1. Столько камней поставил Моисей.", "2. В гавайском алфавите столько же букв.", "3. Столько разгневанных мужчин в классическом фильме."], answer: "12", fact: "Алан Шепард играл там в гольф." },
  { question: "Сколько недель простоял Козельск против орды Батыя в 1238 году?", hints: ["1. Столько планет в Солнечной системе.", "2. Количество континентов.", "3. Именно столько основных нот."], answer: "7", fact: "Козельск прозвали «злым городом»." },
  { question: "Принято считать, что именно столько существует основных сортов чая.", hints: ["1. Столько игроков на поле в волейболе.", "2. Среднее количество ног у насекомых.", "3. Столько букв в английском алфавите от E до K."], answer: "6", fact: "Зелёный, чёрный, белый, улун, пуэр и жёлтый." },
  { question: "Гарнизон Брестской крепости держал оборону невероятное количество дней. Назовите число.", hints: ["1. Атомный номер Германий.", "2. Точка замерзания воды по Фаренгейту.", "3. Именно столько зубов во рту взрослого человека."], answer: "32", fact: "Крепость держалась 32 дня." },
  { question: "Какова была длина (в метрах) легендарного дирижабля «Гинденбург»?", hints: ["1. Телефонный код Гвинеи-Бисау.", "2. Длительность режиссерской версии «Возвращения короля».", "3. Столько лет назад (от 2021) закончилось Восстание США."], answer: "245", fact: "Это как три самолета Боинг 747!" },
  { question: "Какое счастливое число присвоил Кристиан Диор своей самой продаваемой помаде?", hints: ["1. Три последние цифры года «Проблемы 2000».", "2. Номер вызова экстренных служб в Европе.", "3. Трехзначный палиндром между 900 и 1000."], answer: "999", fact: "Оттенок 999 — самый узнаваемый красный цвет." },
  { question: "В скольких тюрьмах побывал Чарльз Бронсон?", hints: ["1. Количество лет жизни людей до Потопа.", "2. Тонн крови в год перекачивает сердце.", "3. Число CXX в римской системе."], answer: "120", fact: "Бронсон сменил 120 тюрем." },
  { question: "Сколько спутников у Юпитера официально подтверждено на текущий момент?", hints: ["1. Октановое число самого дорогого бензина.", "2. Последние две цифры года выхода «Истории игрушек».", "3. Количество тезисов Мартина Лютера."], answer: "95", fact: "Юпитер — настоящий король спутников." },
  { question: "На сколько процентов по массе земной коры наша планета состоит из кислорода?", hints: ["1. Атомный номер элемента Индий.", "2. Год до н.э., когда началась война Цезаря.", "3. Число «смертных мук» в Японии."], answer: "49", fact: "Почти половина веса земли — это кислород!" },
  { question: "Какое число стоит в названии «Клуба музыкантов», умерших на пике славы?", hints: ["1. Столько костей в кисти руки.", "2. Столько поправок внесено в Конституцию США.", "3. Столько стран входит в состав Евросоюза."], answer: "27", fact: "Клуб 27 — печальная легенда рок-н-ролла." },
  { question: "Сколько лет провёл в заточении главный герой фильма «Олдбой»?", hints: ["1. Номер аркана «Дьявол» в картах Таро.", "2. Возраст «Пятнадцатилетнего капитана».", "3. Количество фишек в игре «Пятнашки»."], answer: "15", fact: "15 лет полной изоляции." },
  { question: "Сколько Великих Домов Вестероса выделяют в каноне «Игры Престолов»?", hints: ["1. Номер симфонии Бетховена.", "2. Наибольшее однозначное число.", "3. Столько месяцев длится беременность."], answer: "9", fact: "Семь королевств, но Девять великих домов." },
  { question: "Сколько гномов-спутников входило в отряд Торина Дубощита в «Хоббите»?", hints: ["1. Количество полос на флаге США.", "2. Столько карт одной масти в колоде.", "3. Это число называют «Чёртовой дюжиной»."], answer: "13", fact: "Нужен был 14-й участник — Бильбо." },
  { question: "Назовите номер правила интернета про порнографию?", hints: ["1. Телефонный код Испании.", "2. Номер легендарного танка Т-...", "3. Номер Шакила О’Нила."], answer: "34", fact: "Правило 34 — закон интернета." },
  { question: "Какой номер был у главного героя (последнего участника) в «Игре в кальмара»?", hints: ["1. Простая последовательность 4, 5, 6.", "2. Разница между 860 и ошибкой 404.", "3. Название модели Ferrari."], answer: "456", fact: "Сон Ги Хун — игрок номер 456." },
  { question: "Сколько официальных студийных альбомов выпустили The Beatles?", hints: ["1. Атомный номер Алюминия.", "2. Количество карт одной масти.", "3. Число, которое часто пропускают в самолетах."], answer: "13", fact: "13 альбомов, которые изменили мир." },
  { question: "Сколько пиратских баронов входило в Совет Братства?", hints: ["1. Столько кругов ада у Данте.", "2. Столько Назгулов у Саурона.", "3. Столько жизней у кошки."], answer: "9", fact: "Девять баронов и девять песо." },
  { question: "В каком году вышел хит «Wind of Change» группы Scorpions?", hints: ["1. Год выхода «Nevermind» Nirvana.", "2. Год-палиндром.", "3. Год распада СССР."], answer: "1991", fact: "Гимн окончания Холодной войны." },
  { question: "Какую цену в долларах называют за услуги в меме Gachimuchi?", hints: ["1. Максимальный результат в боулинге.", "2. Число CCC в римской системе.", "3. Количество спартанцев Леонида."], answer: "300", fact: "Three hundred bucks!" },
  { question: "БЛИЦ: Какова скорость эякулята в км/ч при естественном извержении?", hints: ["1. Номер Майкла Джордана + 22.", "2. Последние две цифры года основания ООН.", "3. Половина от прямого угла."], answer: "45", fact: "45 км/ч. Природа — удивительный инженер!" }
];

// --- 3. HELPERS ---
const encodeCat = (str: string) => Buffer.from(str).toString('base64').replace(/=/g, '');
const decodeCat = (str: string) => Buffer.from(str, 'base64').toString('utf-8');

const parseEventDesc = (desc: string | null) => {
  if (!desc) return { title: 'Мероприятие', address: 'Уточняется' };
  const parts = desc.split('###');
  return { title: parts[0].trim(), address: parts[1] ? parts[1].trim() : 'Секретная локация 🔒' };
};

// --- 4. STATE ---
const FAST_DATES_STATE = {
  eventId: 0, round: 0, 
  votes: new Map<number, number[]>(), 
  participants: new Map<number, { id: number, num: number, gender: string, name: string, username: string }>(),
  men: [] as number[], women: [] as number[]
};

const STOCK_STATE = {
  isActive: false, currentQuestionIndex: -1, currentPhase: 0,
  playerAnswers: new Map<number, number>()
};
const TALK_STATE = { currentFact: '', currentUser: '', isActive: false };

// --- 5. БОТ И СЦЕНЫ ---
const bot = new Telegraf<any>(process.env.TELEGRAM_BOT_TOKEN || '');

const registerWizard = new Scenes.WizardScene(
  'REGISTER_SCENE',
  async (ctx) => { await ctx.replyWithHTML(`👋 <b>Почти готово!</b>\n\nНужно внести тебя в базу клуба.\n\n<b>1. Как тебя зовут?</b>`); return ctx.wizard.next(); },
  async (ctx) => { if (!ctx.message || !('text' in ctx.message)) return; (ctx.wizard.state as any).name = ctx.message.text; ctx.reply('2. Твоя дата рождения? (ДД.ММ.ГГГГ)'); return ctx.wizard.next(); },
  async (ctx) => { if (!ctx.message || !('text' in ctx.message)) return; (ctx.wizard.state as any).birthDate = ctx.message.text; ctx.reply('3. Факт о себе, который никто не знает:'); return ctx.wizard.next(); },
  async (ctx) => { if (!ctx.message || !('text' in ctx.message)) return; (ctx.wizard.state as any).fact = ctx.message.text; ctx.reply('4. Самая странная история из жизни:'); return ctx.wizard.next(); },
  async (ctx) => { if (!ctx.message || !('text' in ctx.message)) return; (ctx.wizard.state as any).story = ctx.message.text; ctx.reply('5. Твой пол (для баланса пар):', Markup.keyboard([['Мужчина', 'Женщина']]).oneTime().resize()); return ctx.wizard.next(); },
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) return;
    const gender = ctx.message.text; const data = ctx.wizard.state as any;
    await db.update(schema.users).set({ name: data.name, birthDate: data.birthDate, fact: data.fact, strangeStory: data.story, gender: gender }).where(eq(schema.users.telegramId, ctx.from!.id));
    await ctx.reply('✅ Регистрация завершена успешно!', getMainKeyboard());
    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage<any>([registerWizard]);
bot.use(session()); 
bot.use(stage.middleware());

function getMainKeyboard(isAtEvent = false) {
    const buttons = [['🎮 Игры', '👤 Личный кабинет'], ['🆘 Помощь', '📜 Правила']];
    if (isAtEvent) buttons.unshift(['🎲 Новая тема (для Talk & Toast)']);
    return Markup.keyboard(buttons).resize();
}

// --- 6. АВТОПИЛОТ (Вторичный интервал) ---
setInterval(async () => {
  try {
    const now = DateTime.now(); 
    const activeEvents = await db.query.events.findMany({ where: eq(schema.events.isActive, true) });
    for (const event of activeEvents) {
      const start = DateTime.fromFormat(event.dateString, "dd.MM.yyyy HH:mm");
      if (!start.isValid) continue;
      const diffHours = start.diff(now, 'hours').hours;
      const minutesSinceStart = now.diff(start, 'minutes').minutes;

      if (diffHours >= 71.5 && diffHours <= 72.5 && !PROCESSED_AUTO_ACTIONS.has(`remind_3d_${event.id}`)) {
        PROCESSED_AUTO_ACTIONS.add(`remind_3d_${event.id}`);
        await broadcastToEvent(event.id, `📅 <b>Скоро игра!</b>\n\nНапоминаем, что через 3 дня состоится игра "${event.type}". Готовьтесь!🥂`);
      }
      if (diffHours >= 2.8 && diffHours <= 3.2 && !PROCESSED_AUTO_ACTIONS.has(`reveal_${event.id}`)) {
        PROCESSED_AUTO_ACTIONS.add(`reveal_${event.id}`);
        const { address } = parseEventDesc(event.description);
        await broadcastToEvent(event.id, `📍 <b>Место встречи открыто!</b>\n\nВстречаемся здесь через 3 часа:\n<b>${address}</b>`);
        if (event.type === 'speed_dating') {
          const bookings = await db.query.bookings.findMany({ where: and(eq(schema.bookings.eventId, event.id), eq(schema.bookings.paid, true)) });
          const m: any[] = [], w: any[] = [];
          for (const b of bookings) {
            const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
            if (u?.gender === 'Мужчина') m.push(u); else if (u?.gender === 'Женщина') w.push(u);
          }
          for (let i = 0; i < Math.min(m.length, w.length); i++) {
            const wNum = (i * 2) + 1; const mNum = (i * 2) + 2;
            FAST_DATES_STATE.participants.set(w[i].telegramId, { id: w[i].id, num: wNum, gender: 'Женщина', name: w[i].name, username: w[i].username || '' });
            FAST_DATES_STATE.participants.set(m[i].telegramId, { id: m[i].id, num: mNum, gender: 'Мужчина', name: m[i].name, username: m[i].username || '' });
            bot.telegram.sendMessage(w[i].telegramId, `💘 <b>Ваш номер: ${wNum}</b>`).catch(()=>{});
            bot.telegram.sendMessage(m[i].telegramId, `💘 <b>Ваш номер: ${mNum}</b>`).catch(()=>{});
          }
        }
      }
      if (minutesSinceStart >= 105 && event.type === 'talk_toast' && !PROCESSED_AUTO_ACTIONS.has(`quiz_${event.id}`)) {
        PROCESSED_AUTO_ACTIONS.add(`quiz_${event.id}`); await runAutoQuiz(event.id);
      }
      if (minutesSinceStart >= 135 && !PROCESSED_AUTO_ACTIONS.has(`close_${event.id}`)) {
        PROCESSED_AUTO_ACTIONS.add(`close_${event.id}`); await autoCloseEvent(event.id);
      }
    }
  } catch (e) { console.error(e); }
}, 60000);

async function runAutoQuiz(eventId: number) {
  const bks = await db.query.bookings.findMany({ where: and(eq(schema.bookings.eventId, eventId), eq(schema.bookings.paid, true)) });
  if (bks.length < 2) return;
  await broadcastToEvent(eventId, `🔔 <b>ВНИМАНИЕ! Викторина!</b> Угадайте, чей это факт из анкеты!`);
  await new Promise(r => setTimeout(r, 7000));
  const shuf = bks.sort(() => 0.5 - Math.random()).slice(0, 3);
  for (const b of shuf) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
    if (!u || !u.fact) continue;
    await broadcastToEvent(eventId, `❓ <b>ЧЕЙ ЭТО ФАКТ?</b>\n\n«${u.fact}»`);
    await new Promise(r => setTimeout(r, 30000));
    await broadcastToEvent(eventId, `🔓 <b>ПРАВИЛЬНЫЙ ОТВЕТ:</b> Это — <b>${u.name}</b>! ✨`);
    await new Promise(r => setTimeout(r, 7000));
  }
}

async function autoCloseEvent(eventId: number) {
  await db.update(schema.events).set({ isActive: false }).where(eq(schema.events.id, eventId));
  const bks = await db.query.bookings.findMany({ where: and(eq(schema.bookings.eventId, eventId), eq(schema.bookings.paid, true)) });
  for (const b of bks) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
    if (u) {
      await db.update(schema.users).set({ gamesPlayed: (u.gamesPlayed || 0) + 1 }).where(eq(schema.users.id, u.id));
      bot.telegram.sendMessage(u.telegramId, '🎁 Игра завершена! +1 балл лояльности начислен. До встречи! ✨');
    }
  }
}

// --- 7. ОБРАБОТЧИКИ ---

bot.start(async (ctx) => {
  let user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
  if (!user) {
    const startPayload = ctx.message.text.split(' ')[1]; 
    let referrerId = 0;
    if (startPayload?.startsWith('ref_')) referrerId = parseInt(startPayload.replace('ref_', ''));
    const [newUser] = await db.insert(schema.users).values({ telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name, isAdmin: ctx.from.id === ADMIN_ID, invitedBy: referrerId || null }).returning();
    if (referrerId) { 
        await db.insert(schema.vouchers).values({ userId: newUser.id, status: 'approved_10' }); 
        await ctx.reply('🎁 Тебе начислена скидка 10 PLN на первую игру от друга!');
    }
  }
  return ctx.reply('👋 Привет в Allgorithm! Выбирай игру:', getMainKeyboard());
});

bot.hears('👤 Личный кабинет', async (ctx) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
  if (!user) return;
  const vouchers = await db.query.vouchers.findMany({ where: and(eq(schema.vouchers.userId, user.id), eq(schema.vouchers.status, 'approved_10')) });
  let msg = `👤 <b>Имя:</b> ${user.name || 'Не заполнено'}\n🎫 <b>Скидки:</b> ${vouchers.length} шт. (-10 PLN)\n👥 <b>Приглашено:</b> ${user.invitedCount || 0}`;
  const buttons = [
    [Markup.button.callback(user.name ? '✏️ Изменить анкету' : '📝 Заполнить анкету', 'start_registration')],
    [Markup.button.callback('📸 У меня есть ваучер', 'upload_voucher')],
    [Markup.button.callback('🎮 Мои записи на игры', 'my_games')],
    [Markup.button.callback('🤝 Реферальная программа', 'referral_info')]
  ];
  return ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
});

bot.action('referral_info', async (ctx) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from!.id) });
    if (!user) return;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;
    const msg = `🤝 <b>Скидка обоим!</b>\n\n• Друг получает <b>-10 PLN</b> сразу.\n• Ты получаешь <b>-10 PLN</b> после его первой оплаты!\n\nТвоя ссылка: <code>${refLink}</code>`;
    return ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'back_to_cabinet')]]) });
});

bot.action('back_to_cabinet', (ctx) => ctx.deleteMessage());

bot.hears('🎮 Игры', (ctx) => {
  ctx.reply('Выберите игру:', Markup.inlineKeyboard([
    [Markup.button.callback('Talk & Toast 🥂', 'game_talk')],
    [Markup.button.callback('Stock & Know 🧠', 'game_stock')],
    [Markup.button.callback('Быстрые свидания 💘', 'game_dating')]
  ]));
});


// Кнопка "📜 Правила"
bot.hears('📜 Правила', (ctx) => {
  const rulesText = `📜 <b>Правила клуба Allgorithm</b>\n\n` +
    `🔻 <b>ОБЩИЕ ПРАВИЛА:</b>\n` +
    `1. 18+: Строго для совершеннолетних. Врать про возраст — ваша ответственность.\n` +
    `2. Честная игра: Без обмана, гугла и мухлежа. Мы здесь за чилом!\n` +
    `3. Культура: Мат, спам и оскорбления = бан без разговоров.\n` +
    `4. Оплата: Нет оплаты — нет регистрации.(нету ручек - нет конфетки) Платеж — ваш входной билет.\n` +
    `5. Администрация: Слово ведущего — закон. Можем удалить за нарушение без возврата средств.\n\n` +
    `🔻 <b>ВОЗВРАТ СРЕДСТВ:</b>\n` +
    `1. За 36 часов: Предупредите за 36 часов — вернем деньги.\n` +
    `2. Менее 36 часов: Деньги не возвращаются.\n` +
    `3. Отмена игры: Если отменим мы — вернем всем.\n\n` +
    `🔻 <b>ПРАВИЛА ПОВЕДЕНИЯ:</b>\n` +
    `1. Тайминг: Приходите за 10-15 минут до, чтобы заказать еду.\n` +
    `2. Еда и Напитки: Оплата за заказы в ресторане производится на месте отдельно.\n` +
    `3. Тишина: Не болтать во время объяснения правил.\n` +
    `4. Без советов: Не перебивайте ведущих. Все жалобы и советы — в конце вечера.\n` +
    `5. Атмосфера: Оставляем неуместные комментарии и душноту дома. Если вопрос не нравится — это часть игры.`;

  ctx.replyWithHTML(rulesText);
});

// Кнопка "🆘 Помощь"
bot.hears('🆘 Помощь', (ctx) => {
  (ctx.session as any).waitingForSupport = true; // Установка флага ожидания сообщения
  ctx.reply('Напишите ваш вопрос или описание проблемы прямо сюда. Администратор свяжется с вами в ближайшее время! 👇');
});

// --- 8. ЛОГИКА ИГР ---

bot.action('game_talk', (ctx) => ctx.editMessageText(`🥂 <b>Talk & Toast</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Записаться', 'book_talk')], [Markup.button.callback('🎲 Темы', 'get_random_topic')], [Markup.button.callback('🔙 Назад', 'back_to_games')]]) }));
bot.action('game_stock', (ctx) => ctx.editMessageText(`🧠 <b>Stock & Know</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Записаться', 'book_stock')], [Markup.button.callback('🔙 Назад', 'back_to_games')]]) }));
bot.action('game_dating', (ctx) => ctx.editMessageText(`💘 <b>Fast Dates</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📅 Записаться', 'book_dating')], [Markup.button.callback('🔙 Назад', 'back_to_games')]]) }));

bot.action('book_talk', async (ctx) => bookGame(ctx, 'talk_toast'));
bot.action('book_stock', async (ctx) => bookGame(ctx, 'stock_know'));
bot.action('book_dating', async (ctx) => bookGame(ctx, 'speed_dating'));

async function bookGame(ctx: any, type: string) {
  const events = await db.query.events.findMany({ where: and(eq(schema.events.type, type), eq(schema.events.isActive, true)) });
  if (events.length === 0) return ctx.reply(`Расписание формируется!`);
  if (type === 'talk_toast') {
    const uniqueTitles = new Set<string>(); events.forEach(e => uniqueTitles.add(parseEventDesc(e.description).title));
    const btns = Array.from(uniqueTitles).map(t => [Markup.button.callback(t, `cv_${TYPE_MAP[type]}_${encodeCat(t)}`)]);
    return ctx.editMessageText('Выбери направление:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'back_to_games')]]) });
  }
  const buttons = events.map(e => [Markup.button.callback(`📅 ${e.dateString} (${e.currentPlayers}/${e.maxPlayers})`, `pay_event_${e.id}`)]);
  ctx.editMessageText('Выбери дату:', Markup.inlineKeyboard([...buttons, [Markup.button.callback('🔙 Назад', 'back_to_games')]]));
}

bot.action(/cv_(.+)_(.+)/, async (ctx) => {
  const type = REV_TYPE_MAP[ctx.match[1]]; const selectedTitle = decodeCat(ctx.match[2]);
  const events = await db.query.events.findMany({ where: and(eq(schema.events.type, type), eq(schema.events.isActive, true)) });
  const filtered = events.filter(e => parseEventDesc(e.description).title === selectedTitle);
  const btns = filtered.map(e => [Markup.button.callback(`📅 ${e.dateString} (${e.currentPlayers}/${e.maxPlayers})`, `pay_event_${e.id}`)]);
  ctx.editMessageText(`🍝 <b>${selectedTitle}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(btns) });
});

bot.action('back_to_games', (ctx) => { ctx.deleteMessage(); ctx.reply('Выберите игру:', Markup.inlineKeyboard([[Markup.button.callback('Talk & Toast 🥂', 'game_talk')], [Markup.button.callback('Stock & Know 🧠', 'game_stock')], [Markup.button.callback('Fast Dates 💘', 'game_dating')]])); });

bot.action('my_games', async (ctx) => {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
    if (!user) return;
    const myBookings = await db.select({ bid: schema.bookings.id, d: schema.events.dateString }).from(schema.bookings).innerJoin(schema.events, eq(schema.bookings.eventId, schema.events.id)).where(and(eq(schema.bookings.userId, user.id), eq(schema.bookings.paid, true), eq(schema.events.isActive, true)));
    if (myBookings.length === 0) return ctx.reply('📭 У вас нет активных записей.');
    for (const b of myBookings) {
        await ctx.reply(`🗓 <b>${b.d}</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить запись', `conf_canc_${b.bid}`)]]) });
    }
});

bot.action(/conf_canc_(\d+)/, async (ctx) => {
    const bookingId = parseInt(ctx.match[1]);
    ctx.editMessageReplyMarkup({ inline_keyboard: [[Markup.button.callback('🔥 ДА, ОТМЕНИТЬ', `exec_canc_${bookingId}`)], [Markup.button.callback('🔙 Назад', 'my_games')]] });
});

bot.action(/exec_canc_(\d+)/, async (ctx) => {
    const bookingId = parseInt(ctx.match[1]);
    const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
    if (!booking) return;
    const event = await db.query.events.findFirst({ where: eq(schema.events.id, booking.eventId) });
    if (!event) return;
    if (DateTime.fromFormat(event.dateString, "dd.MM.yyyy HH:mm").diffNow('hours').hours < 36) return ctx.reply('⚠️ Поздновато для отмены.');
    
    // МЕЛОЧЬ: Возврат ваучера (Full Free vs 10 PLN)
    const usedVoucher = await db.query.vouchers.findFirst({ where: and(eq(schema.vouchers.userId, booking.userId), eq(schema.vouchers.status, 'used')), orderBy: [desc(schema.vouchers.id)] });
    if (usedVoucher) await db.update(schema.vouchers).set({ status: usedVoucher.photoFileId ? 'approved_free' : 'approved_10' }).where(eq(schema.vouchers.id, usedVoucher.id));
    
    await db.delete(schema.bookings).where(eq(schema.bookings.id, bookingId));
    await db.update(schema.events).set({ currentPlayers: Math.max(0, (event.currentPlayers || 0) - 1) }).where(eq(schema.events.id, event.id));
    ctx.editMessageText('✅ Запись отменена. Скидка/Ваучер возвращены в кабинет.');
});

// --- 9. ОПЛАТА (ПОЛНАЯ) ---

bot.action(/pay_event_(\d+)/, async (ctx) => {
    const eid = parseInt(ctx.match[1]);
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from!.id) });
    if (!user?.name) return ctx.reply('Сначала заполни анкету!', Markup.inlineKeyboard([[Markup.button.callback('📝 Заполнить', 'start_registration')]]));

    try {
        const event = await db.query.events.findFirst({ where: eq(schema.events.id, eid) });
        if (!event) return;

        // 1. МЕЛОЧЬ: Каждая 5-я игра бесплатно
        if (((user.gamesPlayed || 0) + 1) % 5 === 0) {
            await db.insert(schema.bookings).values({ userId: user.id, eventId: eid, paid: true });
            await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eid));
            return ctx.reply('🎁 Поздравляем! Это твоя 5-я игра, она БЕСПЛАТНАЯ! 🎉');
        }

        // 2. МЕЛОЧЬ: Проверка активных ваучеров
        const activeVoucher = await db.query.vouchers.findFirst({ 
            where: (v, { and, eq, or }) => and(eq(v.userId, user.id), or(eq(v.status, 'approved_10'), eq(v.status, 'approved_free'))) 
        });

        if (activeVoucher?.status === 'approved_free') {
            await db.insert(schema.bookings).values({ userId: user.id, eventId: eid, paid: true });
            await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eid));
            await db.update(schema.vouchers).set({ status: 'used' }).where(eq(schema.vouchers.id, activeVoucher.id));
            return ctx.reply('🎫 Оплачено FREE ваучером! Ты в игре!');
        }

        // 3. Страйп (BLIK включен)
        const sessionMetadata: any = { telegramId: ctx.from!.id.toString(), eventId: eid.toString() };
        let discounts = [];
        if (activeVoucher?.status === 'approved_10') {
            discounts = [{ coupon: STRIPE_COUPON_ID }];
            sessionMetadata.voucherId = activeVoucher.id.toString();
        }

        const stripeSession = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'blik', 'revolut_pay'],
            line_items: [{ price: GAME_PRICES[event.type], quantity: 1 }],
            metadata: sessionMetadata,
            discounts: discounts,
            mode: 'payment',
            locale: 'ru',
            success_url: `https://t.me/${ctx.botInfo.username}`,
            cancel_url: `https://t.me/${ctx.botInfo.username}`,
        });

        await ctx.reply(`К оплате: ${activeVoucher ? '40' : '50'} PLN`, Markup.inlineKeyboard([[Markup.button.url('💸 Оплатить (BLIK, Revolut...)', stripeSession.url!)], [Markup.button.callback('✅ Я оплатил', `confirm_pay_${eid}`)]]));

    } catch (e) { console.error(e); ctx.reply('Ошибка Stripe. Проверь валюту в Dashboard!'); }
});

bot.action(/confirm_pay_(\d+)/, async (ctx) => {
    const eid = parseInt(ctx.match[1]);
    try {
        const sessions = await stripe.checkout.sessions.list({ limit: 15 });
        const paid = sessions.data.find(s => s.metadata?.telegramId === ctx.from!.id.toString() && s.metadata?.eventId === eid.toString() && s.payment_status === 'paid');
        if (!paid) return ctx.reply('🔍 Оплата не найдена. Подождите 10 сек.');

        const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from!.id) });
        if (!user) return;
        if (paid.metadata?.voucherId) await db.update(schema.vouchers).set({ status: 'used' }).where(eq(schema.vouchers.id, parseInt(paid.metadata.voucherId)));
        await db.insert(schema.bookings).values({ userId: user.id, eventId: eid, paid: true });

        // МЕЛОЧЬ: Бонус пригласившему только после оплаты друга
        if (user.invitedBy) {
            const inviter = await db.query.users.findFirst({ where: eq(schema.users.id, user.invitedBy) });
            if (inviter) {
                await db.insert(schema.vouchers).values({ userId: inviter.id, status: 'approved_10' });
                bot.telegram.sendMessage(inviter.telegramId, `🎉 Твой друг оплатил игру! Тебе начислена скидка -10 PLN!`).catch(()=>{});
                await db.update(schema.users).set({ invitedBy: null }).where(eq(schema.users.id, user.id));
            }
        }
        const event = await db.query.events.findFirst({ where: eq(schema.events.id, eid) });
        if (event) await db.update(schema.events).set({ currentPlayers: (event.currentPlayers || 0) + 1 }).where(eq(schema.events.id, eid));
        await ctx.editMessageText('🎉 Оплата подтверждена! Ты в игре! 😎');
    } catch (e) { ctx.reply('Ошибка проверки.'); }
});

// --- 10. ВАУЧЕРЫ ---

bot.action('upload_voucher', (ctx) => { ctx.reply('📸 Отправь фото ваучера прямо сюда.'); (ctx.session as any).waitingForVoucher = true; });

bot.on('photo', async (ctx, next) => {
    if (!(ctx.session as any)?.waitingForVoucher) return next();
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, ctx.from.id) });
    if (user) {
        const [v] = await db.insert(schema.vouchers).values({ userId: user.id, photoFileId: photo.file_id, status: 'pending' }).returning();
        ctx.reply('✅ Ваучер отправлен на проверку.'); (ctx.session as any).waitingForVoucher = false;
        await bot.telegram.sendPhoto(ADMIN_ID, photo.file_id, {
            caption: `🎟 Ваучер от ${user.name}`,
            ...Markup.inlineKeyboard([[Markup.button.callback('💰 -10 PLN', `v_set_10_${v.id}`)], [Markup.button.callback('🎁 FREE', `v_set_free_${v.id}`)]])
        });
    }
});

bot.action(/v_set_(10|free)_(\d+)/, async (ctx) => {
    const vId = parseInt(ctx.match[2]); const status = ctx.match[1] === '10' ? 'approved_10' : 'approved_free';
    await db.update(schema.vouchers).set({ status }).where(eq(schema.vouchers.id, vId));
    const v = await db.query.vouchers.findFirst({ where: eq(schema.vouchers.id, vId) });
    if (v && v.userId) { const u = await db.query.users.findFirst({ where: eq(schema.users.id, v.userId) }); if (u) bot.telegram.sendMessage(u.telegramId, `🎉 Твой ваучер одобрен!`); }
    await ctx.editMessageCaption(`✅ Готово: ${status}`);
});

// --- 11. АДМИНКА (ВСЕ ПУЛЬТЫ) ---

bot.command('panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  ctx.reply('🔒 Админ-панель', Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить игру', 'admin_add_event')],
    [Markup.button.callback('📋 Записи', 'admin_bookings')],
    [Markup.button.callback('💘 Пульт FD', 'admin_fd_panel')],
    [Markup.button.callback('🧠 Пульт Stock', 'admin_stock_list')],
    [Markup.button.callback('🏁 ЗАВЕРШИТЬ ИГРУ', 'admin_close_event')],
    [Markup.button.callback('📢 Рассылка', 'admin_broadcast_start')]
  ], { columns: 2 }));
});

// ПУЛЬТ FD
bot.action('admin_fd_panel', ctx => { ctx.editMessageText(`💘 <b>Пульт Speed Dating</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✍️ Ввести анкеты', 'fd_input_start')], [Markup.button.callback('🏁 Рассчитать мэтчи', 'fd_calc_matches')]]) }); });
bot.action('fd_input_start', ctx => { const btns = Array.from(FAST_DATES_STATE.participants.values()).sort((a,b)=>a.num-b.num).map(p => [Markup.button.callback(`№${p.num} (${p.gender[0]})`, `fd_edit_${p.id}`)]); ctx.editMessageText('Чью анкету вводим?', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'admin_fd_panel')]])); });
bot.action(/fd_edit_(\d+)/, async (ctx) => {
  const uid = parseInt(ctx.match[1]); const u = Array.from(FAST_DATES_STATE.participants.values()).find(p => p.id === uid);
  const targets = Array.from(FAST_DATES_STATE.participants.values()).filter(p => p.gender !== u?.gender).sort((a,b)=>a.num-b.num);
  const utid = Array.from(FAST_DATES_STATE.participants.entries()).find(([t,p])=>p.id===uid)?.[0] || 0;
  const votes = FAST_DATES_STATE.votes.get(utid) || [];
  const btns = targets.map(t => Markup.button.callback(`${votes.includes(t.id)?'✅':''} №${t.num}`, `fd_tog_${uid}_${t.id}`));
  const rows = []; while(btns.length) rows.push(btns.splice(0,4));
  ctx.editMessageText(`Анкета №${u?.num}`, Markup.inlineKeyboard([...rows, [Markup.button.callback('💾 Сохранить', 'fd_input_start')]]));
});
bot.action(/fd_tog_(\d+)_(\d+)/, async (ctx) => {
  const vId = parseInt(ctx.match[1]); const tId = parseInt(ctx.match[2]);
  const vTid = Array.from(FAST_DATES_STATE.participants.entries()).find(([t,p])=>p.id===vId)?.[0] || 0;
  if (!FAST_DATES_STATE.votes.has(vTid)) FAST_DATES_STATE.votes.set(vTid, []);
  let v = FAST_DATES_STATE.votes.get(vTid)!;
  FAST_DATES_STATE.votes.set(vTid, v.includes(tId) ? v.filter(id=>id!==tId) : [...v, tId]);
  const u = Array.from(FAST_DATES_STATE.participants.values()).find(p => p.id === vId);
  const targets = Array.from(FAST_DATES_STATE.participants.values()).filter(p => p.gender !== u?.gender).sort((a,b)=>a.num-b.num);
  const btns = targets.map(t => Markup.button.callback(`${FAST_DATES_STATE.votes.get(vTid)!.includes(t.id)?'✅':''} №${t.num}`, `fd_tog_${vId}_${t.id}`));
  const rows = []; while(btns.length) rows.push(btns.splice(0,4));
  await ctx.editMessageText(`Анкета №${u?.num}`, Markup.inlineKeyboard([...rows, [Markup.button.callback('💾 Сохранить', 'fd_input_start')]]));
});
bot.action('fd_calc_matches', async (ctx) => {
  let count = 0;
  for (const [tid, p] of FAST_DATES_STATE.participants) {
    const myLikes = FAST_DATES_STATE.votes.get(tid) || [];
    for (const tId of myLikes) {
      const tEntry = Array.from(FAST_DATES_STATE.participants.entries()).find(([t, tp]) => tp.id === tId);
      if (tEntry && FAST_DATES_STATE.votes.get(tEntry[0])?.includes(p.id)) {
        count++; bot.telegram.sendMessage(tid, `💖 <b>У вас МЭТЧ!</b>\n\nВы совпали с №${tEntry[1].num} (${tEntry[1].name}).\n@${tEntry[1].username}`, { parse_mode: 'HTML' }).catch(()=>{});
      }
    }
  }
  ctx.reply(`🏁 Мэтчей найдено: ${count/2}`);
});

// ПУЛЬТ STOCK
bot.action('admin_stock_list', (ctx) => {
  const btns = STOCK_QUESTIONS.map((q, i) => [Markup.button.callback(`Вопрос №${i+1}`, `sk_pick_${i}`)]);
  ctx.editMessageText('🧠 Выберите вопрос:', Markup.inlineKeyboard([...btns, [Markup.button.callback('🔙', 'panel')]]));
});
bot.action(/sk_pick_(\d+)/, (ctx) => {
  STOCK_STATE.currentQuestionIndex = parseInt(ctx.match[1]); STOCK_STATE.playerAnswers.clear();
  ctx.editMessageText(`Вопрос выбран.`, Markup.inlineKeyboard([[Markup.button.callback('🚀 ОТПРАВИТЬ', 'stock_send_phase_0')]]));
});
bot.action(/stock_send_phase_(\d+)/, async (ctx) => {
  const phase = parseInt(ctx.match[1]); const q = STOCK_QUESTIONS[STOCK_STATE.currentQuestionIndex];
  let msg = phase === 0 ? `❓ <b>ВОПРОС:</b>\n${q.question}` : phase <= 3 ? `💡 <b>ПОДСКАЗКА №${phase}:</b>\n${q.hints[phase-1]}` : `🏁 <b>ОТВЕТ: ${q.answer}</b>\n${q.fact}`;
  const active = await db.query.events.findFirst({ where: and(eq(schema.events.type, 'stock_know'), eq(schema.events.isActive, true)) });
  if (active) await broadcastToEvent(active.id, msg);
  const buttons = []; if (phase < 4) buttons.push([Markup.button.callback(phase === 3 ? '✅ ОТВЕТ' : `💡 Подсказка ${phase+1}`, `stock_send_phase_${phase+1}`)]);
  buttons.push([Markup.button.callback('📊 Ответы', 'admin_stock_show_answers')]);
  ctx.editMessageText(`Фаза ${phase}.`, Markup.inlineKeyboard([...buttons, [Markup.button.callback('🔙', 'admin_stock_list')]]));
});
bot.action('admin_stock_show_answers', async (ctx) => {
  let msg = '📋 <b>Ответы игроков:</b>\n\n'; const btns = [];
  for (const [tid, val] of STOCK_STATE.playerAnswers) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.telegramId, tid) });
    msg += `👤 ${user?.name || tid}: <b>${val}</b>\n`; btns.push([Markup.button.callback(`🏆 Победил ${user?.name || tid}`, `sk_winner_${tid}`)]);
  }
  ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([...btns]) });
});
bot.action(/sk_winner_(\d+)/, async (ctx) => {
  const winTid = parseInt(ctx.match[1]); const u = await db.query.users.findFirst({ where: eq(schema.users.telegramId, winTid) });
  const active = await db.query.events.findFirst({ where: and(eq(schema.events.type, 'stock_know'), eq(schema.events.isActive, true)) });
  if (active && u) await broadcastToEvent(active.id, `🎊 В этом раунде победил(а) <b>${u.name}</b>!`);
  ctx.reply('✅ Победитель объявлен.');
});

// --- 12. ГЛАВНЫЙ ОБРАБОТЧИК ---

bot.on('message', async (ctx, next) => {
  const userId = ctx.from?.id; 
  const sess = ctx.session as any; 
  const text = (ctx.message as any).text;

  if (!userId || !text) return next();

  // Логика рассылки для админа
  if (sess?.waitingForBroadcast && userId === ADMIN_ID) {
    const users = await db.query.users.findMany();
    for (const u of users) { 
      try { 
        await ctx.telegram.copyMessage(u.telegramId, ctx.chat!.id, ctx.message.message_id); 
      } catch(e) {} 
    }
    sess.waitingForBroadcast = false; 
    return ctx.reply(`✅ Рассылка окончена!`);
  }

  // Логика ответов в игре Stock & Know
  if (STOCK_STATE.currentQuestionIndex !== -1 && !isNaN(parseInt(text)) && !text.startsWith('/')) {
    if (!STOCK_STATE.playerAnswers.has(userId)) { 
      STOCK_STATE.playerAnswers.set(userId, parseInt(text)); 
      return ctx.reply(`✅ Ставка принята!🎰`); 
    }
  }

  // --- ВОТ ИСПРАВЛЕННЫЙ БЛОК ПОДДЕРЖКИ ---
  if (sess?.waitingForSupport) {
    const adminMsg = `🆘 <b>ВОПРОС В ПОДДЕРЖКУ</b>\n\n` +
      `<b>От:</b> ${ctx.from.first_name} (@${ctx.from.username || 'нет_юзернейма'})\n` +
      `<b>ID:</b> <code>${ctx.from.id}</code>\n\n` +
      `<b>Текст:</b> ${text}\n\n` +
      `________________________________\n` +
      `Чтобы ответить, скопируй эту строку целиком, вставь в чат и допиши текст:\n` +
      `<code>/reply ${ctx.from.id} </code>`;

    await ctx.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
    ctx.reply('✅ Ваше сообщение отправлено администратору!');
    sess.waitingForSupport = false; 
    return;
  }

  return next();
});

bot.command('reply', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const p = ctx.message.text.split(' ');
  bot.telegram.sendMessage(p[1], `👮‍♂️ <b>Ответ админа:</b>\n\n${p.slice(2).join(' ')}`, { parse_mode: 'HTML' });
});

bot.action('start_registration', (ctx) => { ctx.deleteMessage(); ctx.scene.enter('REGISTER_SCENE'); });

// --- ЗАПУСК ЧЕРЕЗ ВЕБХУК (СТРОГО В КОНЦЕ ФАЙЛА) ---

// --- СТРОГО В КОНЦЕ ФАЙЛА ---

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;

app.use(express.json());
app.use(bot.webhookCallback('/telegraf-webhook'));

app.get('/', (req, res) => res.send('Allgorithm Bot is Live! ✅'));

app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  if (WEBHOOK_URL) {
    try {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegraf-webhook`);
      console.log(`📡 Вебхук установлен: ${WEBHOOK_URL}/telegraf-webhook`);
    } catch (e) {
      console.error('❌ Ошибка вебхука:', e);
    }
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
