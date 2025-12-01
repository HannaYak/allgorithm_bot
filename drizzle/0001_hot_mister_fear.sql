CREATE TABLE `adminLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`action` varchar(255) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fastDatesMatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`maleUserId` int NOT NULL,
	`femaleUserId` int NOT NULL,
	`maleVote` boolean DEFAULT false,
	`femaleVote` boolean DEFAULT false,
	`isMatch` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fastDatesMatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `freeGameCounters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gamesUsed` int NOT NULL DEFAULT 0,
	`freeGamesPerCycle` int NOT NULL DEFAULT 4,
	`lastResetAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `freeGameCounters_id` PRIMARY KEY(`id`),
	CONSTRAINT `freeGameCounters_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `gameEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`eventDate` timestamp NOT NULL,
	`location` varchar(255),
	`cuisine` varchar(255),
	`currentParticipants` int NOT NULL DEFAULT 0,
	`maxParticipants` int NOT NULL,
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gameEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gameRegistrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`eventId` int NOT NULL,
	`participantNumber` int,
	`status` enum('registered','confirmed','completed','cancelled') NOT NULL DEFAULT 'registered',
	`paymentStatus` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gameRegistrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('talk_toast','stock_know','fast_dates') NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`maxParticipants` int NOT NULL,
	`duration` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `games_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockKnowAnswers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` int NOT NULL,
	`userId` int NOT NULL,
	`answer` text,
	`isCorrect` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stockKnowAnswers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockKnowQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`questionNumber` int NOT NULL,
	`question` text NOT NULL,
	`correctAnswer` text NOT NULL,
	`hints` text,
	`currentRound` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stockKnowQuestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`userId` int,
	`message` text NOT NULL,
	`isAdminMessage` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supportMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportTickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supportTickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fullName` varchar(255),
	`dateOfBirth` varchar(10),
	`secretFact` text,
	`strangeStory` text,
	`gender` enum('male','female') NOT NULL,
	`registrationCompleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userProfiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userVouchers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`voucherId` int NOT NULL,
	`voucherCode` varchar(50) NOT NULL,
	`status` enum('pending','approved','rejected','used') NOT NULL DEFAULT 'pending',
	`receiptPhoto` varchar(512),
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userVouchers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vouchers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`discount` int NOT NULL,
	`type` enum('fixed','percentage') NOT NULL DEFAULT 'fixed',
	`maxUses` int,
	`currentUses` int NOT NULL DEFAULT 0,
	`expiresAt` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vouchers_id` PRIMARY KEY(`id`),
	CONSTRAINT `vouchers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `users` RENAME COLUMN `openId` TO `telegramId`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_telegramId_unique` UNIQUE(`telegramId`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `loginMethod`;