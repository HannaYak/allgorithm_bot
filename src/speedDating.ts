import { Markup } from 'telegraf';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '../drizzle/schema'; // Assuming schema is in a sibling directory
import { db } from './db'; // Assuming db is exported from a db.ts file

interface Participant {
  id: number; // Telegram ID
  num: number; // Assigned number
  gender: 'Мужчина' | 'Женщина';
  name: string;
  username?: string; // Optional, for match-making
}

interface FastDatesState {
  eventId: number;
  currentRound: number;
  participants: Map<number, Participant>; // Telegram ID -> Participant
  votes: Map<number, number[]>; // Voter Telegram ID -> Array of liked Participant Telegram IDs
}

export const FAST_DATES_STATE: FastDatesState = {
  eventId: 0,
  currentRound: 1,
  participants: new Map<number, Participant>(),
  votes: new Map<number, number[]>(),
};

const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0'); // Assuming ADMIN_ID is in .env

const CONVERSATION_TOPICS = [
  "Если бы ты мог/ла пригласить кого-нибудь на ужин(из мёртвых или живых), кого бы ты выбрал/а и почему?", "Хотел/а бы ты быть знаменитым/ой? Если да, то чем?", "Прежде чем сделать звонок, ты репетируешь свою реплику?", "Когда ты в последний раз пел/а в одиночестве?", "Если бы ты мог/ла прожить до 100 лет, сохранив разум или тело 30-летнего, что бы выбрал/а?", "У тебя есть тайное предчувствие того, как ты умрешь?", "Назови три черты, которые есть и у тебя, и у кого либо за столом.", "За что ты испытываешь наибольшую благодарность?", "Если бы ты мог, что бы ты изменил/а в воспитании себя?", "За 3 минуты расскажи историю своей жизни.", "Если бы ты мог/ла проснуться с новым умением, что бы это было?", "Если бы магический кристалл мог открыть правду, о чем бы ты узнал?", "Есть ли что-то, что ты давно мечтаешь сделать?", "Самое большое достижение в твоей жизни?", "Что в дружбе для тебя наиболее ценно?", "Какое твое самое дорогое воспоминание?", "Какое твое самое ужасное воспоминание?", "Если бы ты знал, что умрешь через год, что бы ты изменил?", "Что для тебя значит дружба?", "Какую роль любовь играет в твоей жизни?", "По очереди называйте положительные черты, на ваш взгляд, собеседников.", "Какие отношения в твоей семье, например близкие или отдалённые?", "Что ты чувствуешь в связи с твоими отношениями с матерью?", "Составьте три утверждения «мне кажется мы оба...» с каким либо из участников", "Продолжите фразу: «Я бы хотел, чтобы был кто-то, с кем можно разделить…»", "Если бы ты стал близким другом для кого-то, что бы ты ему рассказал?", "Расскажи участникам, что тебе в них нравится (честно).", "Поделитесь смущающим моментом из жизни.", "Когда ты в последний раз плакал и почему?", "Что ты ценишь в людях и почему?", "Какая тема слишком серьезна для шуток?", "Если бы ты исчез сегодня, о чем несказанном жалел бы?", "Дом горит. Что спасешь (кроме живых существ, документов и денег)?", "Что в этом году случилось впервые?", "Какие качества ты любишь и ненавидишь в себе?", "Что для Вас значит слово успех?", "Что бы вы сказали себе 15-летнему?", "О чём вы можете говорить часами?", "Какой лучший совет Вам давали?", "Без чего не проживаете ни дня?", "Кем ты работаешь? Расскажи неочевидный факт из профессии.", "Если бы пришлось есть одно блюдо всю жизнь, что это было бы?", "Твой «Бесполезный талант»?", "Что популярно, но тебя бесит?", "Место, которое разочаровало? И куда хочешь вернуться?", "Роли в зомби-апокалипсисе: лидер, предатель, первая жертва. Кто ты?", "100 млн долларов, но нельзя тратить на себя. Куда денешь?", "Путешествие во времени, у тебя только 1 час (можно только смотреть). Куда отправишься?", "Кем мечтал стать в 7 лет?", "За что тебя выгоняли из класса?", "Месяц без смартфона за миллион?", "Кот или собака? Продай мне выбор."
];

// Helper function to broadcast messages to all participants of an event
async function broadcastToEvent(eventId: number, message: string, bot: any) {
  const bookings = await db.query.bookings.findMany({
    where: and(eq(schema.bookings.eventId, eventId), eq(schema.bookings.paid, true))
  });

  const uniqueTgIds = new Set<number>();
  for (const b of bookings) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
    if (u?.telegramId) uniqueTgIds.add(u.telegramId);
  }

  for (const tgId of uniqueTgIds) {
    bot.telegram.sendMessage(tgId, message, { parse_mode: 'HTML' })
      .catch((err: any) => console.error(`Ошибка отправки на ${tgId}:`, err));
  }
}

export async function loadDatingCommand(ctx: any, bot: any) {
  if (ctx.from.id !== ADMIN_ID) return;
  const parts = ctx.message.text.split(' ');
  const eid = parseInt(parts[1]);

  if (!eid) return ctx.reply('❌ Пиши: /load_dating [ID_Игры]');

  try {
    const bookings = await db.query.bookings.findMany({ 
        where: and(eq(schema.bookings.eventId, eid), eq(schema.bookings.paid, true)) 
    });

    if (bookings.length === 0) return ctx.reply('❌ В базе нет оплаченных броней на этот ID.');

    FAST_DATES_STATE.participants.clear();
    FAST_DATES_STATE.eventId = eid;
    FAST_DATES_STATE.currentRound = 1; 
    FAST_DATES_STATE.votes.clear(); // Clear votes on reload

    const men: Participant[] = [];
    const women: Participant[] = [];

    // В файле speedDating.ts внутри loadDatingCommand
    for (const b of bookings) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
        if (u) {
        // Умная проверка пола: переводим в нижний регистр и ищем корень "муж"
            const dbGender = (u.gender || '').toLowerCase();
            const finalGender = dbGender.includes('муж') ? 'Мужчина' : 'Женщина';

            const participant: Participant = {
                id: u.telegramId!,
                num: 0, // Присвоится ниже
                gender: finalGender as 'Мужчина' | 'Женщина', 
                name: u.name || u.firstName || 'Участник',
                username: u.username || undefined,
            };
            if (participant.gender === 'Мужчина') men.push(participant);
            else women.push(participant);
        }
    }

    // Gender balance check
    if (Math.abs(men.length - women.length) > 0) {
        await ctx.reply(`🚨 <b>ВНИМАНИЕ: Дисбаланс полов!</b>\nМужчин: ${men.length}, Женщин: ${women.length}.\nРекомендуется равное количество участников для Speed Dating.`, { parse_mode: 'HTML' });
        // Optionally, you could stop the loading here or ask for admin confirmation
    }

        // Внутри loadDatingCommand заменяем блок раздачи:
    const limit = Math.min(men.length, women.length);
    for (let i = 0; i < limit; i++) {
        const wNum = (i * 2) + 1; // 1, 3, 5...
        const mNum = (i * 2) + 2; // 2, 4, 6...

    // Записываем в память
        women[i].num = wNum;
        men[i].num = mNum;
        FAST_DATES_STATE.participants.set(women[i].id, women[i]);
        FAST_DATES_STATE.participants.set(men[i].id, men[i]);

    // 🔥 ВОТ ЭТО ДОБАВЛЯЕМ: Сразу шлем номера игрокам
        bot.telegram.sendMessage(women[i].id, `🎫 Твой игровой номер на сегодня: <b>${wNum}</b>\nЗапомни его!`, { parse_mode: 'HTML' }).catch(()=>{});
        bot.telegram.sendMessage(men[i].id, `🎫 Твой игровой номер на сегодня: <b>${mNum}</b>\nЗапомни его!`, { parse_mode: 'HTML' }).catch(()=>{});
    }

    await ctx.reply(`✅ РЕАНИМАЦИЯ ИГРЫ №${eid} УСПЕШНА!\nЗагружено участников: ${FAST_DATES_STATE.participants.size}\n\nТеперь кнопки админки и "Новая тема" оживут!`, { parse_mode: 'HTML' });
  } catch (e) {
    console.error(e);
    ctx.reply('❌ Ошибка при загрузке.');
  }
}

// --- 1. НАЧАТЬ 1-Й РАУНД ---
export async function startDatingGame(ctx: any, bot: any) {
  if (FAST_DATES_STATE.participants.size === 0) {
    return ctx.reply("❌ Ошибка: Участники не загружены! Введи: /load_dating [ID]");
  }

  FAST_DATES_STATE.currentRound = 1; 
  const ps = Array.from(FAST_DATES_STATE.participants.values());
  const women = ps.filter(p => p.gender === 'Женщина').sort((a,b) => a.num - b.num);
  const men = ps.filter(p => p.gender === 'Мужчина').sort((a,b) => a.num - b.num);

  const topic = CONVERSATION_TOPICS[Math.floor(Math.random() * CONVERSATION_TOPICS.length)];

  for (let i = 0; i < women.length; i++) {
    const woman = women[i];
    const man = men[i]; 
    const tableNum = i + 1;

    const msg = `🚀 <b>РАУНД №1</b>\n\n` +
                `Займите место за <b>столиком №${tableNum}</b>.\n` +
                `Ваш собеседник: <b>Участник №${man.num}</b>\n\n` +
                `<b>Тема для разговора:</b> ${topic}\n` +
                `<i>Начинает участник №${woman.num}!</i> ✨`;

    bot.telegram.sendMessage(woman.id, msg, { parse_mode: 'HTML' }).catch(()=>{});
    bot.telegram.sendMessage(man.id, msg, { parse_mode: 'HTML' }).catch(()=>{});
  }

  await ctx.editMessageText(`📢 <b>Игра началась! Раунд №1.</b>`, { 
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 СЛЕДУЮЩИЙ РАУНД', 'fd_next_round')],
      [Markup.button.callback('🏁 Рассчитать мэтчи', 'fd_calc_matches')]
    ])
  });
}

// --- 2. СЛЕДУЮЩИЙ РАУНД ---
export async function nextDatingRound(ctx: any, bot: any) {
  const ps = Array.from(FAST_DATES_STATE.participants.values());
  const women = ps.filter(p => p.gender === 'Женщина').sort((a,b) => a.num - b.num);
  const men = ps.filter(p => p.gender === 'Мужчина').sort((a,b) => a.num - b.num);

  if (women.length === 0) return ctx.reply("Ошибка: участники не найдены.");

  FAST_DATES_STATE.currentRound++;
  const round = FAST_DATES_STATE.currentRound;

  if (round > women.length) {
    return ctx.editMessageText("🏁 <b>Все участники познакомились!</b>\nРаунды закончились. Время вводить симпатии!", { parse_mode: 'HTML' });
  }

  const topic = CONVERSATION_TOPICS[Math.floor(Math.random() * CONVERSATION_TOPICS.length)];

  for (let i = 0; i < women.length; i++) {
    const woman = women[i];
    const man = men[(i + round - 1) % men.length];
    const tableNum = i + 1;

    const msg = `🔄 <b>РАУНД №${round}</b>\n\n` +
                `Оставайтесь за <b>столиком №${tableNum}</b>.\n` +
                `К вам подсаживается: <b>Участник №${man.num}</b>.\n\n` +
                `<b>Тема для разговора:</b> ${topic}\n` +
                `<i>Начинает участник №${woman.num}!</i>`;

    bot.telegram.sendMessage(woman.id, msg, { parse_mode: 'HTML' }).catch(()=>{});
    bot.telegram.sendMessage(man.id, msg, { parse_mode: 'HTML' }).catch(()=>{});
  }
  await ctx.reply(`📢 <b>Запущен раунд №${round}!</b>`);
}

// --- 3. ФУНКЦИЯ ДЛЯ КНОПКИ "НОВАЯ ТЕМА" (Добавь это в конец файла!) ---
export async function handleNewTopic(ctx: any, bot: any) {
    const round = FAST_DATES_STATE.currentRound;
    const ps = Array.from(FAST_DATES_STATE.participants.values());
    const me = ps.find(p => p.id === ctx.from.id);

    if (!me || ps.length === 0) return ctx.reply("❌ Ошибка: Участники игры не найдены в системе.");

    const women = ps.filter(p => p.gender === 'Женщина').sort((a,b) => a.num - b.num);
    const men = ps.filter(p => p.gender === 'Мужчина').sort((a,b) => a.num - b.num);
    
    let partner;
    if (me.gender === 'Женщина') {
      const i = women.findIndex(w => w.id === me.id);
      partner = men[(i + round - 1) % men.length];
    } else {
      const j = men.findIndex(m => m.id === me.id);
      const i = ((j - (round - 1)) % women.length + women.length) % women.length;
      partner = women[i];
    }

    if (partner) {
      const randomTopic = CONVERSATION_TOPICS[Math.floor(Math.random() * CONVERSATION_TOPICS.length)];
      const pairMsg = `🎲 <b>Секретная тема только для вашего столика:</b>\n\n${randomTopic}`;
      await bot.telegram.sendMessage(me.id, pairMsg, { parse_mode: 'HTML' });
      await bot.telegram.sendMessage(partner.id, pairMsg, { parse_mode: 'HTML' });
      return ctx.reply("✅ Новая тема отправлена тебе и твоему собеседнику!");
    }
}

export async function calculateMatches(ctx: any, bot: any) {
  let matchCount = 0;
  const matchedPairs: { user1: Participant, user2: Participant }[] = [];

  for (const [voterId, likedIds] of FAST_DATES_STATE.votes) {
    const voter = FAST_DATES_STATE.participants.get(voterId);
    if (!voter) continue;

    for (const targetId of likedIds) {
      const target = FAST_DATES_STATE.participants.get(targetId);
      if (!target) continue;

      // Check for mutual like
      const targetLikes = FAST_DATES_STATE.votes.get(target.id) || [];
      if (targetLikes.includes(voter.id)) {
        // Ensure we don't count pairs twice (e.g., A-B and B-A)
        if (!matchedPairs.some(pair => 
            (pair.user1.id === voter.id && pair.user2.id === target.id) ||
            (pair.user1.id === target.id && pair.user2.id === voter.id)
        )) {
            matchedPairs.push({ user1: voter, user2: target });
            matchCount++;

            // Send match message to both participants
            const voterMsg = `💖 <b>МЭТЧ!</b> Вы понравились <b>№${target.num} ${target.name}</b>!\nЕго/её Telegram: @${target.username || 'не указан'}`; // Added username
            const targetMsg = `💖 <b>МЭТЧ!</b> Вы понравились <b>№${voter.num} ${voter.name}</b>!\nЕго/её Telegram: @${voter.username || 'не указан'}`; // Added username

            bot.telegram.sendMessage(voter.id, voterMsg, { parse_mode: 'HTML' }).catch(()=>{});
            bot.telegram.sendMessage(target.id, targetMsg, { parse_mode: 'HTML' }).catch(()=>{});
        }
      }
    }
  }
  ctx.reply(`🏁 Найдено мэтчей: ${matchCount}`, { parse_mode: 'HTML' });
}

export function getAdminFDCPanel(ctx: any) {
    const ps = Array.from(FAST_DATES_STATE.participants.values());
    if (ps.length === 0) {
        return ctx.reply("❌ Нет активных участников. Загрузите игру командой /load_dating [ID_Игры]");
    }

    const btns = ps.sort((a,b)=>a.num-b.num).map(p => [Markup.button.callback(`№${p.num} (${p.gender[0]})`, `fd_edit_${p.id}`)]); 
    return ctx.editMessageText(
        `<b>Панель управления быстрыми свиданиями</b>\n\n` +
        `Текущий раунд: <b>${FAST_DATES_STATE.currentRound}</b>\n` +
        `Всего участников: <b>${FAST_DATES_STATE.participants.size}</b>\n\n` +
        `Выберите участника для ввода симпатий или действие:`, 
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                ...btns,
                [Markup.button.callback('🔄 СЛЕДУЮЩИЙ РАУНД', 'fd_next_round')],
                [Markup.button.callback('🏁 Рассчитать мэтчи', 'fd_calc_matches')],
                [Markup.button.callback('🔙 Назад в админку', 'admin_panel')]
            ])
        }
    );
}

export async function editParticipantLikes(ctx: any) {
    const uid = parseInt(ctx.match[1]); 
    const u = FAST_DATES_STATE.participants.get(uid);
    if (!u) return ctx.answerCbQuery('Участник не найден!');

    const targets = Array.from(FAST_DATES_STATE.participants.values()).filter(p => p.gender !== u.gender);
    const votes = FAST_DATES_STATE.votes.get(u.id) || [];
    const btns = targets.map(t => Markup.button.callback(`${votes.includes(t.id)?'✅':' '} №${t.num} ${t.name}`, `fd_tog_${uid}_${t.id}`));
    const rows = []; while(btns.length) rows.push(btns.splice(0,2)); // 2 buttons per row for better display

    await ctx.editMessageText(`Кто понравился №${u.num} ${u.name} (${u.gender})?`, Markup.inlineKeyboard([
        ...rows, 
        [Markup.button.callback('💾 Сохранить и вернуться', 'admin_fd_panel')]
    ]));
}

export async function toggleParticipantLike(ctx: any) {
    const voterId = parseInt(ctx.match[1]); 
    const targetId = parseInt(ctx.match[2]);

    let votesArray = FAST_DATES_STATE.votes.get(voterId) || [];
    if (votesArray.includes(targetId)) {
        votesArray = votesArray.filter(id => id !== targetId);
    } else {
        votesArray.push(targetId);
    }
    FAST_DATES_STATE.votes.set(voterId, votesArray);

    // Re-render the buttons to show updated selection
    const u = FAST_DATES_STATE.participants.get(voterId);
    if (!u) return ctx.answerCbQuery('Ошибка: Голосующий участник не найден!');

    const targets = Array.from(FAST_DATES_STATE.participants.values()).filter(p => p.gender !== u.gender);
    const currentVotes = FAST_DATES_STATE.votes.get(voterId) || [];
    const btns = targets.map(t => Markup.button.callback(`${currentVotes.includes(t.id)?'✅':' '} №${t.num} ${t.name}`, `fd_tog_${voterId}_${t.id}`));
    const rows = []; while(btns.length) rows.push(btns.splice(0,2));

    await ctx.editMessageReplyMarkup({ inline_keyboard: [...rows, [Markup.button.callback('💾 Сохранить и вернуться', 'admin_fd_panel')]] });
    await ctx.answerCbQuery('Выбор обновлен!');
}

// Placeholder for db.ts and schema.ts imports. These would need to be defined in your project.
// For example, db.ts might look like:
/*
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import 'dotenv/config';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });
*/

// And schema.ts would contain your Drizzle ORM schema definitions.
