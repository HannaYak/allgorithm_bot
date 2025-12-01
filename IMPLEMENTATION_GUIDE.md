# 📖 Пошаговая инструкция по завершению Telegram-бота Allgorithm

Привет! Это подробный гайд, как завершить бота. Я объясню всё просто, как для ребёнка 🙂

---

## 🎯 Что уже готово?

✅ База данных (14 таблиц)  
✅ Регистрация пользователей  
✅ Главное меню  
✅ Админ-панель  
✅ Система поддержки  

**Что нужно сделать:**

1. Запустить бота локально (тест)
2. Добавить Stripe (оплата)
3. Добавить игровые функции
4. Развернуть на Render.com

---

## 📋 Шаг 1: Запустить бота локально (тест)

### Что это?
Это значит запустить бота на своём компьютере, чтобы проверить, что всё работает, прежде чем выкладывать в интернет.

### Как сделать?

**1.1. Получить токен бота от BotFather**

- Откройте Telegram
- Найдите бота `@BotFather`
- Напишите `/newbot`
- Следуйте инструкциям
- Скопируйте токен (выглядит так: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

**1.2. Создать файл `.env.local`**

В папке проекта (`/home/ubuntu/allgorithm_bot/`) создайте файл с названием `.env.local`:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=вставьте_ваш_токен_сюда

# Остальное оставьте как есть (для локального тестирования)
DATABASE_URL=mysql://user:password@host:port/database
NODE_ENV=development
```

**1.3. Запустить бота**

Откройте терминал и напишите:

```bash
cd /home/ubuntu/allgorithm_bot
pnpm dev
```

Если всё хорошо, вы увидите:
```
[Bot] Polling started
Server running on http://localhost:3000/
```

**1.4. Протестировать в Telegram**

- Откройте Telegram
- Найдите своего бота (по названию, которое вы дали BotFather)
- Напишите `/start`
- Должно появиться приветствие и кнопка "Пройти анкету"

**Если не работает?**
- Проверьте, что токен правильно скопирован в `.env.local`
- Проверьте, что вы в правильной папке (`/home/ubuntu/allgorithm_bot`)
- Перезагрузите терминал

---

## 💳 Шаг 2: Добавить Stripe (оплату за игры)

### Что это?
Stripe — это сервис, который берёт деньги у пользователей. Нужен для оплаты игр.

### Как сделать?

**2.1. Зарегистрироваться на Stripe**

- Откройте https://stripe.com
- Нажмите "Sign up"
- Заполните данные
- Подтвердите email

**2.2. Получить API ключи**

- Войдите в Stripe Dashboard
- Слева нажмите "Developers" → "API keys"
- Скопируйте:
  - **Publishable key** (начинается с `pk_test_`)
  - **Secret key** (начинается с `sk_test_`)

**2.3. Добавить ключи в `.env.local`**

Откройте файл `.env.local` и добавьте:

```env
STRIPE_SECRET_KEY=sk_test_вставьте_ваш_ключ_сюда
STRIPE_PUBLIC_KEY=pk_test_вставьте_ваш_ключ_сюда
```

**2.4. Создать файл для оплаты**

Создайте новый файл: `/home/ubuntu/allgorithm_bot/server/bot/payment.ts`

Вставьте этот код:

```typescript
import Stripe from 'stripe';
import { getDb } from '../db';
import { gameRegistrations } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
});

/**
 * Создать платёж для игры
 */
export async function createPaymentIntent(
  userId: number,
  eventId: number,
  amount: number, // в центах (100 = 1 доллар)
  description: string
) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      description,
      metadata: {
        userId: userId.toString(),
        eventId: eventId.toString(),
      },
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error('[Payment] Error creating payment:', error);
    return {
      success: false,
      error: 'Payment creation failed',
    };
  }
}

/**
 * Подтвердить платёж
 */
export async function confirmPayment(paymentIntentId: string) {
  const db = await getDb();
  if (!db) return false;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Обновить статус регистрации
      const userId = parseInt(paymentIntent.metadata?.userId || '0');
      const eventId = parseInt(paymentIntent.metadata?.eventId || '0');

      if (userId && eventId) {
        await db
          .update(gameRegistrations)
          .set({ paymentStatus: 'completed' })
          .where(
            eq(gameRegistrations.userId, userId) &&
            eq(gameRegistrations.eventId, eventId)
          );
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error('[Payment] Error confirming payment:', error);
    return false;
  }
}

/**
 * Получить статус платежа
 */
export async function getPaymentStatus(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.status;
  } catch (error) {
    console.error('[Payment] Error getting payment status:', error);
    return null;
  }
}
```

**2.5. Добавить кнопку оплаты в регистрацию**

Откройте файл: `/home/ubuntu/allgorithm_bot/server/bot/handlers.ts`

Найдите строку с `game_talk_toast` и добавьте обработчик оплаты (после строки с `game_fast_dates`):

```typescript
  // Обработчик оплаты
  bot.action(/pay_for_event_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      await ctx.answerCbQuery();
      return;
    }

    // Создать платёж (100 = 1 доллар)
    const payment = await require('./payment').createPaymentIntent(
      user.id,
      eventId,
      1000, // 10 долларов
      `Регистрация на игру #${eventId}`
    );

    if (payment.success) {
      await ctx.reply(
        `💳 Платёж создан!\n\n` +
        `Сумма: $10\n` +
        `ID платежа: ${payment.paymentIntentId}\n\n` +
        `Используйте этот ID для подтверждения платежа.`
      );
    } else {
      await ctx.reply('❌ Ошибка при создании платежа');
    }

    await ctx.answerCbQuery();
  });
```

---

## 🎮 Шаг 3: Добавить игровые функции

### Что это?
Это функции, которые делают игры интерактивными:
- Кнопка "Дай тему!" для Talk & Toast
- Управление вопросами для Stock & Know
- Смена раундов для Fast Dates

### Как сделать?

**3.1. Добавить обработчик для "Дай тему!"**

Откройте `/home/ubuntu/allgorithm_bot/server/bot/handlers.ts`

После всех других `bot.action()` добавьте:

```typescript
  // Кнопка "Дай тему!" для Talk & Toast
  bot.action(/topic_event_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);

    // Список случайных вопросов для разговора
    const topics = [
      '🎬 Какой твой любимый фильм и почему?',
      '✈️ Куда бы ты хотел поехать в отпуск?',
      '🍕 Какое твоё любимое блюдо?',
      '📚 Какую последнюю книгу ты читал?',
      '🎵 Какой твой любимый исполнитель?',
      '🏃 Чем ты занимаешься в свободное время?',
      '🌍 Если бы ты мог жить в любой стране, какую выбрал бы?',
      '💭 Какой был самый интересный день в твоей жизни?',
    ];

    // Выбрать случайный вопрос
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];

    await ctx.reply(
      `🎯 **Тема для разговора:**\n\n${randomTopic}`,
      { parse_mode: 'Markdown' }
    );

    await ctx.answerCbQuery();
  });
```

**3.2. Добавить кнопку "Дай тему!" в меню игры**

Найдите в файле `handlers.ts` строку с `game_talk_toast` и измените её:

**Было:**
```typescript
  bot.action('game_talk_toast', async (ctx) => {
    await ctx.reply('🍽️ Talk & Toast');
```

**Стало:**
```typescript
  bot.action('game_talk_toast', async (ctx) => {
    await ctx.reply('🍽️ **Talk & Toast**\n\n8 человек, один большой стол, викторина из фактов участников.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎯 Дай тему!', callback_data: 'topic_event_1' }],
          [{ text: '📋 Правила', callback_data: 'talk_toast_rules' }],
          [{ text: '⬅️ Назад', callback_data: 'games' }],
        ],
      },
      parse_mode: 'Markdown',
    });
    await ctx.answerCbQuery();
  });
```

**3.3. Добавить обработчик для правил Talk & Toast**

```typescript
  bot.action('talk_toast_rules', async (ctx) => {
    await ctx.reply(
      '📖 **Правила Talk & Toast**\n\n' +
      '1️⃣ Все сидят за одним столом\n' +
      '2️⃣ Можно нажать "Дай тему!" для случайного вопроса\n' +
      '3️⃣ За 15 минут до конца — викторина\n' +
      '4️⃣ Викторина из фактов анкет участников\n' +
      '5️⃣ Длительность: 2 часа\n\n' +
      '<!-- PLACEHOLDER: Добавь свои правила здесь -->',
      { parse_mode: 'Markdown' }
    );
    await ctx.answerCbQuery();
  });
```

---

## 🚀 Шаг 4: Развернуть на Render.com

### Что это?
Render.com — это облачный сервис, где ваш бот будет работать 24/7 в интернете.

### Как сделать?

**4.1. Создать аккаунт на Render**

- Откройте https://render.com
- Нажмите "Sign up"
- Выберите "Sign up with GitHub" (или создайте аккаунт)

**4.2. Залить код на GitHub**

Откройте терминал и напишите:

```bash
cd /home/ubuntu/allgorithm_bot

# Инициализировать Git
git init

# Добавить все файлы
git add .

# Создать коммит
git commit -m "Initial commit - Allgorithm bot"

# Добавить удалённый репозиторий (замените на ваш)
git remote add origin https://github.com/ВАШ_ЛОГИН/allgorithm_bot.git

# Загрузить на GitHub
git push -u origin main
```

**4.3. Создать Web Service на Render**

- Откройте https://dashboard.render.com
- Нажмите "New +" → "Web Service"
- Выберите ваш GitHub репозиторий
- Заполните:
  - **Name:** `allgorithm-bot`
  - **Build Command:** `pnpm install && pnpm build`
  - **Start Command:** `pnpm start`
  - **Environment:** Node

**4.4. Добавить переменные окружения**

В Render Dashboard нажмите "Environment" и добавьте:

```
TELEGRAM_BOT_TOKEN=ваш_токен
DATABASE_URL=ваша_база_данных
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
NODE_ENV=production
```

**4.5. Получить URL вашего приложения**

После развёртывания Render даст вам URL типа:
```
https://allgorithm-bot.onrender.com
```

**4.6. Установить webhook для Telegram**

Откройте браузер и перейдите по ссылке (замените на ваш токен и URL):

```
https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/setWebhook?url=https://allgorithm-bot.onrender.com/api/telegram/webhook
```

Должно вернуться:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

**Готово! 🎉**

Теперь ваш бот работает в интернете!

---

## 📝 Что нужно заполнить вручную?

Есть несколько мест, где нужно добавить свой текст:

### 1. Правила игр

Откройте `/home/ubuntu/allgorithm_bot/server/bot/handlers.ts`

Найдите:
```typescript
bot.action('rules', async (ctx) => {
```

Замените:
```typescript
'<!-- PLACEHOLDER: Добавь правила здесь -->\n' +
'Правила будут добавлены администратором.'
```

На свои правила.

### 2. Вопросы для Stock & Know

Откройте `/home/ubuntu/allgorithm_bot/server/bot/games.ts`

Найдите функцию `createStockKnowQuestion` и добавьте вопросы через админ-панель.

### 3. Сообщение приветствия

Откройте `/home/ubuntu/allgorithm_bot/server/bot/handlers.ts`

Найдите:
```typescript
await ctx.reply(
  '👋 Добро пожаловать в Allgorithm!\n\n'
```

Измените текст на свой.

---

## ✅ Чеклист завершения

- [ ] Получить токен BotFather
- [ ] Создать `.env.local` с токеном
- [ ] Запустить `pnpm dev` и протестировать `/start`
- [ ] Зарегистрироваться на Stripe
- [ ] Добавить Stripe ключи в `.env.local`
- [ ] Создать файл `payment.ts`
- [ ] Добавить кнопку "Дай тему!" для Talk & Toast
- [ ] Заполнить правила игр
- [ ] Создать GitHub репозиторий
- [ ] Развернуть на Render.com
- [ ] Установить webhook для Telegram
- [ ] Протестировать бота в Telegram

---

## 🆘 Если что-то не работает?

**Ошибка: "Bot token is invalid"**
- Проверьте, что токен правильно скопирован в `.env.local`
- Убедитесь, что нет пробелов в начале или конце

**Ошибка: "Database connection failed"**
- Проверьте, что `DATABASE_URL` правильный
- Убедитесь, что база данных запущена

**Ошибка: "Webhook was not set"**
- Проверьте, что URL правильный
- Убедитесь, что приложение развёрнуто на Render

**Бот не отвечает в Telegram**
- Проверьте логи на Render Dashboard
- Убедитесь, что webhook установлен правильно

---

## 🎓 Дополнительные ресурсы

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegraf документация](https://telegraf.js.org/)
- [Stripe документация](https://stripe.com/docs)
- [Render документация](https://render.com/docs)

---

**Удачи! 🚀**

Если у вас есть вопросы, спросите меня!
