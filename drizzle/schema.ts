import { pgTable, serial, text, bigint, boolean, timestamp, integer, varchar, index } from 'drizzle-orm/pg-core';

// === ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ ===
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),

  // === АНКЕТА ===
  name: text('name'),
  birthDate: text('birth_date'),
  gender: text('gender'),
  fact: text('fact'),
  strangeStory: text('strange_story'),
  expectations: text('expectations'),
  profileCompleted: boolean('profile_completed').default(false),

  // Дополнительные поля
  city: varchar('city', { length: 50 }).default('Warsaw'),
  lastActive: timestamp('last_active').defaultNow(),
  isBanned: boolean('is_banned').default(false),
  banReason: text('ban_reason'),

  // Системные поля
  isApproved: boolean('is_approved').default(false),
  gotProfileDiscount: boolean('got_profile_discount').default(false),
  isAdmin: boolean('is_admin').default(false),
  gamesPlayed: integer('games_played').default(0),
  loyaltyPoints: integer('loyalty_points').default(0),

  // === B2B СЕГМЕНТ ===
  isCorporate: boolean('is_corporate').default(false),
  companyName: text('company_name'),
  
  createdAt: timestamp('created_at').defaultNow(),
  invitedBy: bigint('invited_by', { mode: 'number' }),
  referralCount: integer('referral_count').default(0),

  // === ТРЕКИНГ ТРАФИКА ===
  utmSource: varchar('utm_source', { length: 255 }),
  referrerId: bigint('referrer_id', { mode: 'number' }),
});

// === ТАБЛИЦЫ ДЛЯ ИГРЫ "ОСИНТ / ДЕТЕКТИВ" ===
export const detectiveCases = pgTable('detective_cases', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  suspectNumber: integer('suspect_number').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  dossier: text('dossier').notNull(),
  clue: text('clue').notNull(),
  isCulprit: boolean('is_killer').default(false).notNull()
});

export const detectiveVotes = pgTable('detective_votes', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  userId: integer('user_id').notNull(),
  suspectNumber: integer('suspect_number').notNull()
});

export const trialStates = pgTable('trial_states', {
  eventId: integer('event_id').primaryKey(),
  isTrialOpen: boolean('is_trial_open').default(false).notNull(),
  isFinished: boolean('is_finished').default(false).notNull()
});

// === ТАБЛИЦА СОБЫТИЙ (ИГР) ===
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  dateString: text('date_string').notNull(),
  description: text('description'),
  price: integer('price'),
  maxPlayers: integer('max_players').notNull(),
  currentPlayers: integer('current_players').default(0),
  city: varchar('city', { length: 50 }).default('Main'),
  isActive: boolean('is_active').default(true),
});

export const autoStates = pgTable('auto_states', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  value: text('value'),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at'),
});

// === ТАБЛИЦА ЗАПИСЕЙ (БРОНИ) ===
export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  eventId: integer('event_id').references(() => events.id),
  paid: boolean('paid').default(false),
  confirmation: text('confirmation').default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    eventPaidIdx: index('event_paid_idx').on(table.eventId, table.paid)
  };
});

// === ТАБЛИЦА ВАУЧЕРОВ (ОРИГИНАЛЬНАЯ БЕЗ АБОНЕМЕНТОВ) ===
export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  photoFileId: text('photo_file_id'),
  status: text('status').default('pending'),
  usedInEventId: integer('used_in_event_id').references(() => events.id),
});

// === ТАБЛИЦА СКИДОЧНЫХ ВАУЧЕРОВ / ПРОМОКОДОВ ===
export const discountVouchers = pgTable('discount_vouchers', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  discountPercent: integer('discount_percent').default(0),
  discountAmountPln: integer('discount_amount_pln').default(0),
  isActive: boolean('is_active').default(true),
  maxUses: integer('max_uses').default(1),
  usedCount: integer('used_count').default(0),
  expiresAt: timestamp('expires_at'),
});

// === ТАБЛИЦА ИСПОЛЬЗОВАНИЯ СКИДОЧНЫХ ВАУЧЕРОВ ===
export const userVouchers = pgTable('user_vouchers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  voucherId: integer('voucher_id').references(() => discountVouchers.id),
  usedAt: timestamp('used_at').defaultNow(),
});

export const secretLikes = pgTable('secret_likes', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id),
  userId: integer('user_id').references(() => users.id),
  targetUserId: integer('target_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const promoCodes = pgTable('promo_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(),
  maxUses: integer('max_uses').default(1),
  currentUses: integer('current_uses').default(0),
  expiresAt: timestamp('expires_at'),
  eventIds: text('event_ids'),
  isActive: boolean('is_active').default(true),
});

export const reveals = pgTable('reveals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const stockScores = pgTable('stock_scores', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  questionIndex: integer('question_index').notNull(),
  points: integer('points').default(0),
  isWinner: boolean('is_winner').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ratings = pgTable('ratings', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  raterId: integer('rater_id').notNull(),
  targetId: integer('target_id').notNull(),
  stars: integer('stars').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
