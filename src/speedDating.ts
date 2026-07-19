import { Markup } from 'telegraf';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from '../drizzle/schema.js';
import { db } from './db.js';
import { DateTime } from 'luxon';

const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

const CONVERSATION_TOPICS = [
  "Если бы ты мог/ла пригласить кого-нибудь на ужин(из мёртвых или живых), кого бы ты выбрал/а и почему?", "Хотел/а бы ты быть знаменитым/ой? Если да, то чем?", "Прежде чем сделать звонок, ты репетируешь свою реплику?", "Когда ты в последний раз пел/а в одиночестве?", "Если бы ты мог/ла прожить до 100 лет, сохранив разум или тело 30-летнего, что бы выбрал/а?", "У тебя есть тайное предчувствие того, как ты умрешь?", "Назови три черты, которые есть и у тебя, и у кого либо за столом.", "За что ты испытываешь наибольшую благодарность?", "Если бы ты мог, что бы ты изменил/а в воспитании себя?", "За 3 минуты расскажи историю своей жизни.", "Если бы ты мог/ла проснуться с новым умением, что бы это было?", "Если бы магический кристалл мог открыть правду, о чем бы ты узнал?", "Есть ли что-то, что ты давно мечтаешь сделать?", "Самое большое достижение в твоей жизни?", "Что в дружбе для тебя наиболее ценно?", "Какое твое самое дорогое воспоминание?", "Какое твое самое ужасное воспоминание?", "Если бы ты знал, что умрешь через год, что бы ты изменил?", "Что для тебя значит дружба?", "Какую роль любовь играет в твоей жизни?", "По очереди называйте положительные черты, на ваш взгляд, собеседников.", "Какие отношения в твоей семье, например близкие или отдалённые?", "Что ты чувствуешь в связи с твоими отношениями с матерью?", "Составьте три утверждения «мне кажется мы оба...» с каким либо из участников", "Продолжите фразу: «Я бы хотел, чтобы был кто-то, с кем можно разделить…»", "Если бы ты стал близким другом для кого-то, что бы ты ему рассказал?", "Расскажи участникам, что тебе в них нравится (честно).", "Поделитесь смущающим моментом из жизни.", "Когда ты в последний раз плакал и почему?", "Что ты ценишь в людях и почему?", "Какая тема слишком серьезна для шуток?", "Если бы ты исчез сегодня, о чем несказанном жалел бы?", "Дом горит. Что спасешь (кроме живых существ, документов и денег)?", "Что в этом году случилось впервые?", "Какие качества ты любишь и ненавидишь в себе?", "Что для Вас значит слово успех?", "Что бы вы сказали себе 15-летнему?", "О чём вы можете говорить часами?", "Какой лучший совет Вам давали?", "Без чего не проживаете ни дня?", "Кем ты работаешь? Расскажи неочевидный факт из профессии.", "Если бы пришлось есть одно блюдо всю жизнь, что это было бы?", "Твой «Бесполезный талант»?", "Что популярно, но тебя бесит?", "Место, которое разочаровало? И куда хочешь вернуться?", "Роли в зомби-апокалипсисе: лидер, предатель, первая жертва. Кто ты?", "100 млн долларов, но нельзя тратить на себя. Куда денешь?", "Путешествие во времени, у тебя только 1 час (можно только смотреть). Куда отправишься?", "Кем мечтал стать в 7 лет?", "За что тебя выгоняли из класса?", "Месяц без смартфона за миллион?", "Кот или собака? Продай мне выбор."
];

// --- ХЕЛПЕРЫ ДЛЯ БАЗЫ ДАННЫХ ---
export async function getSpeedDatingState(eventId: number) {
  const record = await db.query.autoStates.findFirst({
    where: eq(schema.autoStates.key, `sd_state_${eventId}`)
  });
  if (!record?.value) {
    return { eventId: eventId, currentRound: 0, participants: {} as Record<string, any>, votes: {} as Record<string, number[]> };
  }
  return JSON.parse(record.value);
}

export async function saveSpeedDatingState(eventId: number, state: any) {
  const expiresAt = DateTime.now().plus({ days: 2 }).toJSDate();
  await db.insert(schema.autoStates)
    .values({ key: `sd_state_${eventId}`, value: JSON.stringify(state), expiresAt })
    .onConflictDoUpdate({ target: schema.autoStates.key, set: { value: JSON.stringify(state) } });
}

export async function getCurrentSpeedDatingEventId(): Promise<number> {
  const record = await db.query.autoStates.findFirst({ where: eq(schema.autoStates.key, 'current_sd_event_id') });
  return record?.value ? parseInt(record.value) : 0;
}

export async function setCurrentSpeedDatingEventId(eventId: number) {
  const expiresAt = DateTime.now().plus({ days: 2 }).toJSDate();
  await db.insert(schema.autoStates)
    .values({ key: 'current_sd_event_id', value: eventId.toString(), expiresAt })
    .onConflictDoUpdate({ target: schema.autoStates.key, set: { value: eventId.toString() } });
}


export async function loadDatingCommand(ctx: any, bot: any) {
  if (ctx.from.id !== ADMIN_ID) return;
  const parts = ctx.message.text.split(' ');
  const eid = parseInt(parts[1]);

  if (!eid) return ctx.reply('❌ Пиши: /load_dating [ID_Игры]');

  try {
    const bookings = await db.query.bookings.findMany({ 
      where: and(eq(schema.bookings.eventId, eid), eq(schema.bookings.paid, true)),
      orderBy: [asc(schema.bookings.id)]
    });

    if (bookings.length === 0) return ctx.reply('❌ В базе нет оплаченных броней на этот ID.');

    // Очищаем старое состояние в базе
    const newState = { eventId: eid, currentRound: 1, participants: {} as Record<string, any>, votes: {} as Record<string, number[]> };

    const men: any[] = [];
    const women: any[] = [];

    // Собираем участников
    for (const b of bookings) {
        const u = await db.query.users.findFirst({ where: eq(schema.users.id, b.userId) });
        if (u) {
            const dbGender = (u.gender || '').toLowerCase();
            const finalGender = dbGender.includes('муж') ? 'Мужчина' : 'Женщина';

            const participant = {
                id: u.telegramId!, 
                telegramId: u.telegramId!, 
                num: 0,
                gender: finalGender, 
                name: u.name || u.firstName || 'Участник',
                username: u.username || undefined,
            };
            
            if (participant.gender === 'Мужчина') men.push(participant);
            else women.push(participant);
        }
    }

    if (men.length !== women.length) {
        await ctx.reply(`🚨 <b>ВНИМАНИЕ: Дисбаланс полов!</b>\nМужчин: ${men.length}, Женщин: ${women.length}.`, { parse_mode: 'HTML' });
    }

    // Раздача номеров в стейт
    const limit = Math.min(men.length, women.length);
    for (let i = 0; i < limit; i++) {
        const wNum = (i * 2) + 1;
        const mNum = (i * 2) + 2;

        newState.participants[women[i].telegramId.toString()] = { ...women[i], num: wNum };
        newState.participants[men[i].telegramId.toString()] = { ...men[i], num: mNum };

        await bot.telegram.sendMessage(ADMIN_ID, `✅ Назначено: ${women[i].name} (№${wNum}) и ${men[i].name} (№${mNum})`).catch(()=>{});
    }

    await saveSpeedDatingState(eid, newState);
    await setCurrentSpeedDatingEventId(eid);

    await ctx.reply(`✅ РЕАНИМАЦИЯ ИГРЫ №${eid} УСПЕШНА!\nЗагружено пар: ${limit}\n\nТеперь кнопки админки и "Новая тема" оживут!`, { parse_mode: 'HTML' });

  } catch (e) {
    console.error(e);
    ctx.reply('❌ Ошибка при загрузке.');
  }
}

export async function getAdminFDCPanel(ctx: any) {
    const eid = await getCurrentSpeedDatingEventId();
    if (!eid) return ctx.reply("❌ Нет активной игры. Загрузите через /load_dating [ID_Игры]");

    const sdState = await getSpeedDatingState(eid);
    const ps = Object.values(sdState.participants) as any[];

    if (ps.length === 0) {
        return ctx.reply("❌ Нет активных участников. Загрузите игру.");
    }

    const btns = ps.sort((a,b)=>a.num-b.num).map(p => [Markup.button.callback(`№${p.num} (${p.gender[0]})`, `fd_edit_${p.id}`)]); 
    return ctx.editMessageText(
        `<b>Панель управления быстрыми свиданиями</b>\n\n` +
        `Текущий раунд: <b>${sdState.currentRound}</b>\n` +
        `Всего участников: <b>${ps.length}</b>\n\n` +
        `Выберите участника для ввода симпатий или действие:`, 
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                ...btns,
                [Markup.button.callback('🔄 СЛЕДУЮЩИЙ РАУНД', 'fd_next_round')],
                [Markup.button.callback('🏁 Рассчитать мэтчи', 'fd_calc_matches')],
                [Markup.button.callback('🔙 Назад в админку', 'admin_events_menu')] // Исправлено на admin_events_menu
            ])
        }
    );
}

export async function editParticipantLikes(ctx: any) {
    const uid = parseInt(ctx.match[1]); 
    const eid = await getCurrentSpeedDatingEventId();
    const sdState = await getSpeedDatingState(eid);
    
    // ГЛАВНЫЙ ФИКС: Если votes почему-то нет в базе, создаем его на лету
    if (!sdState.votes) {
        sdState.votes = {};
    }
    
    const u = sdState.participants[uid.toString()] || sdState.participants[uid];
    if (!u) return ctx.answerCbQuery('Участник не найден!');

    const targets = Object.values(sdState.participants).filter((p: any) => p && p.gender !== u.gender) as any[];
    const votes = sdState.votes[u.id.toString()] || sdState.votes[u.id] || [];
    
    const btns = targets.map((t: any) => Markup.button.callback(`${votes.includes(t.id)?'✅':' '} №${t.num} ${t.name}`, `fd_tog_${uid}_${t.id}`));
    const rows = []; while(btns.length) rows.push(btns.splice(0,2));

    await ctx.editMessageText(`Кто понравился №${u.num} ${u.name} (${u.gender})?`, Markup.inlineKeyboard([
        ...rows, 
        [Markup.button.callback('💾 Сохранить и вернуться', 'admin_fd_panel')]
    ]));
}

export async function toggleParticipantLike(ctx: any) {
    const voterId = parseInt(ctx.match[1]); 
    const targetId = parseInt(ctx.match[2]);

    const eid = await getCurrentSpeedDatingEventId();
    const sdState = await getSpeedDatingState(eid);

    if (!sdState.votes) sdState.votes = {};

    // ОБЪЯВЛЯЕМ u (кто голосует)
    const u = sdState.participants[voterId.toString()] || sdState.participants[voterId];
    if (!u) {
        await ctx.answerCbQuery('❌ Голосующий участник не найден в базе.');
        return;
    }

    // Проверяем существование того, за кого голосуют
    const target = sdState.participants[targetId.toString()] || sdState.participants[targetId];
    if (!target) {
        await ctx.answerCbQuery('❌ Участник, за которого вы голосуете, удален.');
        return;
    }

    // Инициализируем массив лайков для этого пользователя, если его нет
    const voterKey = u.id.toString();
    if (!sdState.votes[voterKey]) {
        sdState.votes[voterKey] = [];
    }

    const currentVotes = sdState.votes[voterKey];
    const index = currentVotes.indexOf(target.id);

    if (index > -1) {
        currentVotes.splice(index, 1); // Убираем лайк
    } else {
        currentVotes.push(target.id); // Добавляем лайк
    }

    await saveSpeedDatingState(eid, sdState);

    // Перерисовываем меню выбора лайков для этого игрока
    const targets = Object.values(sdState.participants).filter((p: any) => p && p.gender !== u.gender) as any[];
    const btns = targets.map((t: any) => 
        Markup.button.callback(`${currentVotes.includes(t.id) ? '✅' : ' '} №${t.num} ${t.name}`, `fd_tog_${voterId}_${t.id}`)
    );
    
    const rows = []; while(btns.length) rows.push(btns.splice(0,2));

    await ctx.editMessageText(`Кто понравился №${u.num} ${u.name} (${u.gender})?`, Markup.inlineKeyboard([
        ...rows, 
        [Markup.button.callback('💾 Сохранить и вернуться', 'admin_fd_panel')]
    ]));
    
    await ctx.answerCbQuery();
}



export async function calculateMatches(ctx: any, bot: any) {
  try {
    const eid = await getCurrentSpeedDatingEventId();
    const sdState = await getSpeedDatingState(eid);

    if (!sdState || !sdState.votes) {
      if (sdState) sdState.votes = {};
      return ctx.reply(`🏁 Найдено мэтчей: 0`, { parse_mode: 'HTML' });
    }

    let matchCount = 0;
    const matchedPairs: { user1: any, user2: any }[] = [];
    let adminReport = `📊 <b>Мэтчи рассчитаны и отправлены участникам!</b>\n\n`;

    for (const [voterIdStr, likedIds] of Object.entries(sdState.votes)) {
      const voter = sdState.participants[voterIdStr] || sdState.participants[parseInt(voterIdStr)];
      if (!voter || !Array.isArray(likedIds)) continue;

      for (const targetId of likedIds) {
        if (!targetId) continue;

        const target = sdState.participants[targetId.toString()] || sdState.participants[targetId];
        if (!target) continue;

        const targetLikes = sdState.votes[target.id.toString()] || sdState.votes[target.id] || [];
        if (!Array.isArray(targetLikes)) continue;

        const voterIdNum = Number(voter.id);
        const targetIdNum = Number(target.id);
        const convertedTargetLikes = targetLikes.map(id => Number(id));

        if (convertedTargetLikes.includes(voterIdNum)) {
          if (!matchedPairs.some(pair => 
              (pair.user1.id === voterIdNum && pair.user2.id === targetIdNum) ||
              (pair.user1.id === targetIdNum && pair.user2.id === voterIdNum)
          )) {
              matchedPairs.push({ user1: voter, user2: target });
              matchCount++;

              // Используем глобальные db и schema, которые уже импортированы вверху файла speedDating.ts
              const dbVoter = await db.query.users.findFirst({ where: eq(schema.users.telegramId, voterIdNum) });
              const dbTarget = await db.query.users.findFirst({ where: eq(schema.users.telegramId, targetIdNum) });

              const voterUsername = dbVoter?.username || 'скрыт';
              const targetUsername = dbTarget?.username || 'скрыт';

              // ТЕКСТЫ ДЛЯ САМИХ УЧАСТНИКОВ
              const voterMsg = `💖 <b>МЭТЧ!</b> Вы понравились <b>№${target.num} ${target.name}</b>!\nЕго/её Telegram: @${targetUsername}`;
              const targetMsg = `💖 <b>МЭТЧ!</b> Вы понравились <b>№${voter.num} ${voter.name}</b>!\nЕго/её Telegram: @${voterUsername}`;

              // Рассылаем участникам в личку
              ctx.telegram.sendMessage(voterIdNum, voterMsg, { parse_mode: 'HTML' })
                .catch((e: any) => console.error(`Ошибка отправки игроку ${voterIdNum}:`, e.message));

              ctx.telegram.sendMessage(targetIdNum, targetMsg, { parse_mode: 'HTML' })
                .catch((e: any) => console.error(`Ошибка отправки игроку ${targetIdNum}:`, e.message));

              // Отчет для тебя
              adminReport += `❤️ <b>Пара №${matchCount}:</b>\n`;
              adminReport += `👤 №${voter.num} ${voter.name} (@${voterUsername}) -> отправлено\n`;
              adminReport += `👤 №${target.num} ${target.name} (@${targetUsername}) -> отправлено\n\n`;
          }
        }
      }
    }

    adminReport += `🏁 <b>Всего найдено и разослано мэтчей: ${matchCount}</b>`;
    await ctx.reply(adminReport, { parse_mode: 'HTML' });

  } catch (error: any) {
    console.error("🚨 Критическая ошибка при расчете:", error);
    await ctx.reply(`🚨 Ошибка расчета: ${error.message}`);
  }
}
