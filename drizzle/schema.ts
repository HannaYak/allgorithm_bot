import { pgTable, serial, text, bigint, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

// Таблица пользователей
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  
  // Ответы анкеты
  name: text('name'),
  birthDate: text('birth_date'), // ДД.ММ.ГГГГ
  fact: text('fact'),
  strangeStory: text('strange_story'),
  gender: text('gender'), // 'male' | 'female'
  
  isAdmin: boolean('is_admin').default(false),
  gamesPlayed: integer('games_played').default(0),
  loyaltyPoints: integer('loyalty_points').default(0), // Для 5-й бесплатной
  createdAt: timestamp('created_at').defaultNow(),
  invitedBy: bigint('invited_by', { mode: 'number' }),
});

// Таблица событий (Игр)
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'talk_toast', 'stock_know', 'speed_dating'
  dateString: text('date_string').notNull(), // "20.12.2025 19:00"
  description: text('description'), // Например "Кухня: Азия"
  maxPlayers: integer('max_players').notNull(),
  currentPlayers: integer('current_players').default(0),
  isActive: boolean('is_active').default(true),
});

// Таблица записей на игры
export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  eventId: integer('event_id').references(() => events.id),
  paid: boolean('paid').default(false), // Статус оплаты
  createdAt: timestamp('created_at').defaultNow(),
});

// Таблица ваучеров
export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  photoFileId: text('photo_file_id').notNull(),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  usedInEventId: integer('used_in_event_id').references(() => events.id),
});

export const secretLikes = pgTable('secret_likes', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id),
  userId: integer('user_id').references(() => users.id),
  targetUserId: integer('target_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// В drizzle/schema.ts
export const promoCodes = pgTable('promo_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(),
  maxUses: integer('max_uses').default(1),
  currentUses: integer('current_uses').default(0),
  expiresAt: timestamp('expires_at'),
  eventIds: text('event_ids'), // Теперь тут будет строка типа "12,15,18"
  isActive: boolean('is_active').default(true),
});
