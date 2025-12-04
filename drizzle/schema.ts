// Добавьте pgEnum в фигурные скобки
import { pgTable, serial, text, varchar, timestamp, pgEnum, integer, boolean } from 'drizzle-orm/pg-core';



/**
 * Users table
 */
export const roleEnum = pgEnum('role', ['user', 'admin']);
export const users = pgTable('users', {
  // В Postgres для автоинкремента используется тип 'serial'
  id: serial('id').primaryKey(),
  
  openId: varchar('openId', { length: 64 }).notNull().unique(),
  name: text('name'),
  email: varchar('email', { length: 320 }),
  loginMethod: varchar('loginMethod', { length: 64 }),
  
  // Используем наш enum
  role: roleEnum('role').default('user').notNull(),
  
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(), // В PG "ON UPDATE" делается сложнее, но пока можно оставить так
  lastSignedIn: timestamp('lastSignedIn').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * User profiles
 */
export const userProfiles = pgTable("userProfiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), //.references(() => users.id) - можно добавить FK
  fullName: varchar("fullName", { length: 255 }),
  dateOfBirth: varchar("dateOfBirth", { length: 10 }),
  secretFact: text("secretFact"),
  strangeStory: text("strangeStory"),
  gender: text("gender").notNull(), // 'male' | 'female'
  registrationCompleted: boolean("registrationCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/**
 * Games
 */
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'talk_toast', 'stock_know', 'fast_dates'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  maxParticipants: integer("maxParticipants").notNull(),
  duration: integer("duration").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Game = typeof games.$inferSelect;
export type InsertGame = typeof games.$inferInsert;

/**
 * Game Events
 */
export const gameEvents = pgTable("gameEvents", {
  id: serial("id").primaryKey(),
  gameId: integer("gameId").notNull(),
  eventDate: timestamp("eventDate").notNull(),
  location: varchar("location", { length: 255 }),
  cuisine: varchar("cuisine", { length: 255 }),
  currentParticipants: integer("currentParticipants").default(0).notNull(),
  maxParticipants: integer("maxParticipants").notNull(),
  status: text("status").default("scheduled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GameEvent = typeof gameEvents.$inferSelect;
export type InsertGameEvent = typeof gameEvents.$inferInsert;

/**
 * Game Registrations
 */
export const gameRegistrations = pgTable("gameRegistrations", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  eventId: integer("eventId").notNull(),
  participantNumber: integer("participantNumber"),
  status: text("status").default("registered").notNull(),
  paymentStatus: text("paymentStatus").default("pending").notNull(),
  registeredAt: timestamp("registeredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GameRegistration = typeof gameRegistrations.$inferSelect;
export type InsertGameRegistration = typeof gameRegistrations.$inferInsert;

/**
 * Stock & Know Questions
 */
export const stockKnowQuestions = pgTable("stockKnowQuestions", {
  id: serial("id").primaryKey(),
  eventId: integer("eventId").notNull(),
  questionNumber: integer("questionNumber").notNull(),
  question: text("question").notNull(),
  correctAnswer: text("correctAnswer").notNull(),
  hints: text("hints"), // JSON string
  currentRound: integer("currentRound").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type StockKnowQuestion = typeof stockKnowQuestions.$inferSelect;
export type InsertStockKnowQuestion = typeof stockKnowQuestions.$inferInsert;

/**
 * Stock & Know Answers
 */
export const stockKnowAnswers = pgTable("stockKnowAnswers", {
  id: serial("id").primaryKey(),
  questionId: integer("questionId").notNull(),
  userId: integer("userId").notNull(),
  answer: text("answer"),
  isCorrect: boolean("isCorrect").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/**
 * Fast Dates Matches
 */
export const fastDatesMatches = pgTable("fastDatesMatches", {
  id: serial("id").primaryKey(),
  eventId: integer("eventId").notNull(),
  maleUserId: integer("maleUserId").notNull(),
  femaleUserId: integer("femaleUserId").notNull(),
  maleVote: boolean("maleVote").default(false),
  femaleVote: boolean("femaleVote").default(false),
  isMatch: boolean("isMatch").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/**
 * Support Tickets
 */
export const supportTickets = pgTable("supportTickets", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

/**
 * Support Messages
 */
export const supportMessages = pgTable("supportMessages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticketId").notNull(),
  userId: integer("userId"),
  message: text("message").notNull(),
  isAdminMessage: boolean("isAdminMessage").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = typeof supportMessages.$inferInsert;

/**
 * Vouchers
 */
export const vouchers = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discount: integer("discount").notNull(),
  type: text("type").default("fixed").notNull(),
  maxUses: integer("maxUses"),
  currentUses: integer("currentUses").default(0).notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Voucher = typeof vouchers.$inferSelect;
export type InsertVoucher = typeof vouchers.$inferInsert;

/**
 * User Vouchers
 */
export const userVouchers = pgTable("userVouchers", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  voucherId: integer("voucherId").notNull(),
  voucherCode: varchar("voucherCode", { length: 50 }).notNull(),
  status: text("status").default("pending").notNull(),
  receiptPhoto: varchar("receiptPhoto", { length: 512 }),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserVoucher = typeof userVouchers.$inferSelect;
export type InsertUserVoucher = typeof userVouchers.$inferInsert;

/**
 * Free Game Counters
 */
export const freeGameCounters = pgTable("freeGameCounters", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  gamesUsed: integer("gamesUsed").default(0).notNull(),
  freeGamesPerCycle: integer("freeGamesPerCycle").default(4).notNull(),
  lastResetAt: timestamp("lastResetAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type FreeGameCounter = typeof freeGameCounters.$inferSelect;
export type InsertFreeGameCounter = typeof freeGameCounters.$inferInsert;

/**
 * Admin Logs
 */
export const adminLogs = pgTable("adminLogs", {
  id: serial("id").primaryKey(),
  adminId: integer("adminId").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = typeof adminLogs.$inferInsert;
