# Allgorithm Telegram Bot - Setup Guide

## Overview

Allgorithm is a Telegram bot for organizing social games and events. It features user registration, three types of games (Talk & Toast, Stock & Know, Fast Dates), live admin support, and a personal account system.

## Prerequisites

- Node.js 18+ and pnpm
- Telegram Bot Token (from BotFather)
- MySQL/TiDB database
- Stripe API keys (for payments)
- Render.com account (for deployment)

## Local Development Setup

### 1. Install Dependencies

```bash
cd /home/ubuntu/allgorithm_bot
pnpm install
```

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/telegram/webhook

# Database
DATABASE_URL=mysql://user:password@host:port/database

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...

# OAuth (from Manus)
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
JWT_SECRET=your_jwt_secret

# Application
NODE_ENV=development
```

### 3. Database Setup

Run migrations to create all tables:

```bash
pnpm db:push
```

This will create 14 tables for:
- Users and profiles
- Games and events
- Game registrations
- Support tickets
- Vouchers
- Admin logs

### 4. Start Development Server

```bash
pnpm dev
```

The bot will start with polling (for development) or webhook (for production).

## Bot Features

### User Registration

When a user starts the bot with `/start`:
1. Greeting message
2. "Пройти анкету" (Take questionnaire) button
3. 5 questions:
   - Full name
   - Date of birth (DD.MM.YYYY)
   - Secret fact
   - Strange story
   - Gender (for fast dates)

### Main Menu

After registration, users see a persistent menu:
- 🎮 **Игры** (Games) - Browse and register for games
- 👤 **Личный кабинет** (Personal Account) - View profile and games
- 💬 **Помощь** (Help) - Live chat with admin
- 📖 **Правила** (Rules) - Game rules

### Games

#### Talk & Toast (8 people, 2 hours)
- One big table, no switching
- "Дай тему!" button for random conversation topics
- Quiz with participant facts 15 minutes before end
- Restaurant/cuisine selection

#### Stock & Know (8 people, 2 hours)
- 12 questions
- Admin-controlled question release
- 3 hints system
- Admin selects winner
- Participant answers tracked

#### Fast Dates (14 people, 2 hours)
- Women get table numbers
- Men rotate through rounds
- Admin controls round changes
- Admin inputs votes
- Matches sent at end (name + Telegram)

### Personal Account

- **Мои игры** - List of registered games
- **Мои данные** - Profile information
- **Сколько до бесплатной 5-й** - Free game counter (4 free, 5th paid)
- **Активные ваучеры** - Display -10 zł vouchers
- **У меня есть ваучер** - Upload receipt photo for verification

### Admin Panel

Access with `/panel` (admin only):
- ➕ **Добавить событие** - Add game event in one line
- 🎮 **Сегодняшние игры** - Manage today's games
- 🎫 **Ваучеры на проверку** - Verify user vouchers
- 💬 **Переписка из Помощь** - Review support messages
- 📊 **Статистика** - View statistics

### Live Support

Users click "Помощь" to:
1. Open a support ticket
2. Send messages to admin
3. Receive responses in 5-10 minutes
4. Messages auto-forward to admin's private chat

## Customization

### Add Custom Rules

Edit the rules text in `server/bot/handlers.ts` at the `rules` action handler:

```typescript
bot.action('rules', async (ctx) => {
  await ctx.reply(
    '📖 **Правила Allgorithm**\n\n' +
    '<!-- PLACEHOLDER: Добавь правила здесь -->\n' +
    'Ваши правила...'
  );
});
```

### Add Game Events

In the admin panel, use "Добавить событие" to create game events with:
- Game type
- Date and time
- Location (for Talk & Toast)
- Cuisine type (for Talk & Toast)
- Max participants

### Payment Integration

Stripe is integrated for game payments. Configure in:
- `server/bot/payment.ts` (to be created)
- Environment variables: `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`

## Deployment to Render

### 1. Connect GitHub Repository

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/allgorithm_bot.git
git push -u origin main
```

### 2. Create Render Service

1. Go to [Render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repository
4. Set build command: `pnpm install && pnpm build`
5. Set start command: `pnpm start`
6. Add environment variables from `.env.local`

### 3. Set Webhook URL

After deployment, update the webhook URL:

```env
TELEGRAM_WEBHOOK_URL=https://your-render-app.onrender.com/api/telegram/webhook
```

The bot will automatically set the webhook on startup.

## Database Schema

### Users Table
- `id` - Primary key
- `telegramId` - Telegram user ID (unique)
- `name` - User's name
- `email` - Email address
- `role` - "user" or "admin"
- `createdAt`, `updatedAt`, `lastSignedIn` - Timestamps

### User Profiles Table
- `userId` - Foreign key to users
- `fullName` - Full name from questionnaire
- `dateOfBirth` - DD.MM.YYYY format
- `secretFact` - Secret fact answer
- `strangeStory` - Strange story answer
- `gender` - "male" or "female"
- `registrationCompleted` - Boolean flag

### Games Table
- `id` - Primary key
- `type` - "talk_toast", "stock_know", or "fast_dates"
- `name` - Game name
- `description` - Game description
- `maxParticipants` - Max participants
- `duration` - Duration in minutes

### Game Events Table
- `id` - Primary key
- `gameId` - Foreign key to games
- `eventDate` - Event date and time
- `location` - Location (for Talk & Toast)
- `cuisine` - Cuisine type (for Talk & Toast)
- `currentParticipants` - Current registration count
- `maxParticipants` - Max participants
- `status` - "scheduled", "in_progress", "completed", "cancelled"

### Support Tickets Table
- `id` - Primary key
- `userId` - Foreign key to users
- `status` - "open", "in_progress", "resolved", "closed"
- `createdAt`, `updatedAt` - Timestamps

### Support Messages Table
- `id` - Primary key
- `ticketId` - Foreign key to tickets
- `userId` - User ID (null if admin message)
- `message` - Message text
- `isAdminMessage` - Boolean flag
- `createdAt` - Timestamp

### Vouchers Table
- `id` - Primary key
- `code` - Voucher code
- `discount` - Discount amount
- `type` - "fixed" or "percentage"
- `maxUses` - Max uses (null for unlimited)
- `currentUses` - Current use count
- `expiresAt` - Expiration date

### User Vouchers Table
- `id` - Primary key
- `userId` - Foreign key to users
- `voucherId` - Foreign key to vouchers
- `voucherCode` - Voucher code
- `status` - "pending", "approved", "rejected", "used"
- `receiptPhoto` - S3 URL to receipt
- `usedAt` - When voucher was used

## File Structure

```
server/
  bot/
    index.ts           ← Bot initialization
    handlers.ts        ← Main command handlers
    games.ts           ← Game management
    admin.ts           ← Admin panel
    support.ts         ← Support tickets
  db.ts                ← Database queries
  routers.ts           ← tRPC procedures
drizzle/
  schema.ts            ← Database schema
  migrations/          ← SQL migrations
```

## Troubleshooting

### Bot not responding

1. Check if bot token is correct in environment variables
2. Verify webhook URL is accessible
3. Check logs: `pnpm dev`

### Database connection error

1. Verify `DATABASE_URL` format
2. Check MySQL/TiDB is running
3. Run `pnpm db:push` to create tables

### Payments not working

1. Verify Stripe keys in environment
2. Check Stripe webhook configuration
3. Test with Stripe test mode keys first

## Support

For issues or questions:
1. Check admin panel: `/panel`
2. Review support messages
3. Check application logs

## License

MIT
