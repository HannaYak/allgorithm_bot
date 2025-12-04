CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "adminLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"adminId" integer NOT NULL,
	"action" varchar(255) NOT NULL,
	"details" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fastDatesMatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventId" integer NOT NULL,
	"maleUserId" integer NOT NULL,
	"femaleUserId" integer NOT NULL,
	"maleVote" boolean DEFAULT false,
	"femaleVote" boolean DEFAULT false,
	"isMatch" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freeGameCounters" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"gamesUsed" integer DEFAULT 0 NOT NULL,
	"freeGamesPerCycle" integer DEFAULT 4 NOT NULL,
	"lastResetAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "freeGameCounters_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "gameEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"gameId" integer NOT NULL,
	"eventDate" timestamp NOT NULL,
	"location" varchar(255),
	"cuisine" varchar(255),
	"currentParticipants" integer DEFAULT 0 NOT NULL,
	"maxParticipants" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gameRegistrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"eventId" integer NOT NULL,
	"participantNumber" integer,
	"status" text DEFAULT 'registered' NOT NULL,
	"paymentStatus" text DEFAULT 'pending' NOT NULL,
	"registeredAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"maxParticipants" integer NOT NULL,
	"duration" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stockKnowAnswers" (
	"id" serial PRIMARY KEY NOT NULL,
	"questionId" integer NOT NULL,
	"userId" integer NOT NULL,
	"answer" text,
	"isCorrect" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stockKnowQuestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventId" integer NOT NULL,
	"questionNumber" integer NOT NULL,
	"question" text NOT NULL,
	"correctAnswer" text NOT NULL,
	"hints" text,
	"currentRound" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supportMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"userId" integer,
	"message" text NOT NULL,
	"isAdminMessage" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supportTickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"fullName" varchar(255),
	"dateOfBirth" varchar(10),
	"secretFact" text,
	"strangeStory" text,
	"gender" text NOT NULL,
	"registrationCompleted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userVouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"voucherId" integer NOT NULL,
	"voucherCode" varchar(50) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"receiptPhoto" varchar(512),
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount" integer NOT NULL,
	"type" text DEFAULT 'fixed' NOT NULL,
	"maxUses" integer,
	"currentUses" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_code_unique" UNIQUE("code")
);
