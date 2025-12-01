import { 
  int, 
  mysqlEnum, 
  mysqlTable, 
  text, 
  timestamp, 
  varchar,
  boolean,
  decimal,
  datetime
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with Allgorithm-specific fields for user profiles.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  telegramId: varchar("telegramId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * User profiles - stores questionnaire answers
 */
export const userProfiles = mysqlTable("userProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fullName: varchar("fullName", { length: 255 }),
  dateOfBirth: varchar("dateOfBirth", { length: 10 }), // DD.MM.YYYY format
  secretFact: text("secretFact"),
  strangeStory: text("strangeStory"),
  gender: mysqlEnum("gender", ["male", "female"]).notNull(),
  registrationCompleted: boolean("registrationCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/**
 * Games - defines three types of games
 */
export const games = mysqlTable("games", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["talk_toast", "stock_know", "fast_dates"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  maxParticipants: int("maxParticipants").notNull(),
  duration: int("duration").notNull(), // in minutes
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Game = typeof games.$inferSelect;
export type InsertGame = typeof games.$inferInsert;

/**
 * Game events - scheduled instances of games
 */
export const gameEvents = mysqlTable("gameEvents", {
  id: int("id").autoincrement().primaryKey(),
  gameId: int("gameId").notNull(),
  eventDate: timestamp("eventDate").notNull(),
  location: varchar("location", { length: 255 }), // For Talk & Toast: restaurant name/cuisine type
  cuisine: varchar("cuisine", { length: 255 }), // For Talk & Toast: cuisine direction
  currentParticipants: int("currentParticipants").default(0).notNull(),
  maxParticipants: int("maxParticipants").notNull(),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GameEvent = typeof gameEvents.$inferSelect;
export type InsertGameEvent = typeof gameEvents.$inferInsert;

/**
 * Game registrations - tracks user participation in game events
 */
export const gameRegistrations = mysqlTable("gameRegistrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  eventId: int("eventId").notNull(),
  participantNumber: int("participantNumber"), // Assigned number for the game
  status: mysqlEnum("status", ["registered", "confirmed", "completed", "cancelled"]).default("registered").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "completed", "failed"]).default("pending").notNull(),
  registeredAt: timestamp("registeredAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GameRegistration = typeof gameRegistrations.$inferSelect;
export type InsertGameRegistration = typeof gameRegistrations.$inferInsert;

/**
 * Stock & Know - game-specific questions
 */
export const stockKnowQuestions = mysqlTable("stockKnowQuestions", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  questionNumber: int("questionNumber").notNull(),
  question: text("question").notNull(),
  correctAnswer: text("correctAnswer").notNull(),
  hints: text("hints"), // JSON array of hints
  currentRound: int("currentRound").default(0).notNull(), // 0 = not started, 1-3 = hint rounds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockKnowQuestion = typeof stockKnowQuestions.$inferSelect;
export type InsertStockKnowQuestion = typeof stockKnowQuestions.$inferInsert;

/**
 * Stock & Know - participant answers
 */
export const stockKnowAnswers = mysqlTable("stockKnowAnswers", {
  id: int("id").autoincrement().primaryKey(),
  questionId: int("questionId").notNull(),
  userId: int("userId").notNull(),
  answer: text("answer"),
  isCorrect: boolean("isCorrect").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StockKnowAnswer = typeof stockKnowAnswers.$inferSelect;
export type InsertStockKnowAnswer = typeof stockKnowAnswers.$inferInsert;

/**
 * Fast Dates - match results
 */
export const fastDatesMatches = mysqlTable("fastDatesMatches", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  maleUserId: int("maleUserId").notNull(),
  femaleUserId: int("femaleUserId").notNull(),
  maleVote: boolean("maleVote").default(false), // true = "+"
  femaleVote: boolean("femaleVote").default(false), // true = "+"
  isMatch: boolean("isMatch").default(false), // true if both voted "+"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FastDatesMatch = typeof fastDatesMatches.$inferSelect;
export type InsertFastDatesMatch = typeof fastDatesMatches.$inferInsert;

/**
 * Support tickets - live chat with admin
 */
export const supportTickets = mysqlTable("supportTickets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

/**
 * Support messages - individual messages in support tickets
 */
export const supportMessages = mysqlTable("supportMessages", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  userId: int("userId"), // null if from admin
  message: text("message").notNull(),
  isAdminMessage: boolean("isAdminMessage").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = typeof supportMessages.$inferInsert;

/**
 * Vouchers - discount codes
 */
export const vouchers = mysqlTable("vouchers", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discount: int("discount").notNull(), // discount in PLN or percentage
  type: mysqlEnum("type", ["fixed", "percentage"]).default("fixed").notNull(),
  maxUses: int("maxUses"),
  currentUses: int("currentUses").default(0).notNull(),
  expiresAt: datetime("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Voucher = typeof vouchers.$inferSelect;
export type InsertVoucher = typeof vouchers.$inferInsert;

/**
 * User vouchers - tracks voucher ownership and usage
 */
export const userVouchers = mysqlTable("userVouchers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  voucherId: int("voucherId").notNull(),
  voucherCode: varchar("voucherCode", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "used"]).default("pending").notNull(),
  receiptPhoto: varchar("receiptPhoto", { length: 512 }), // S3 URL
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserVoucher = typeof userVouchers.$inferSelect;
export type InsertUserVoucher = typeof userVouchers.$inferInsert;

/**
 * Free game counter - tracks free games for users
 */
export const freeGameCounters = mysqlTable("freeGameCounters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  gamesUsed: int("gamesUsed").default(0).notNull(),
  freeGamesPerCycle: int("freeGamesPerCycle").default(4).notNull(), // 5th game is paid
  lastResetAt: timestamp("lastResetAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FreeGameCounter = typeof freeGameCounters.$inferSelect;
export type InsertFreeGameCounter = typeof freeGameCounters.$inferInsert;

/**
 * Admin logs - tracks admin actions
 */
export const adminLogs = mysqlTable("adminLogs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = typeof adminLogs.$inferInsert;
