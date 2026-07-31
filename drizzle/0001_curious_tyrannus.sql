CREATE TABLE IF NOT EXISTS "auto_states" (
        "id" serial PRIMARY KEY NOT NULL,
        "key" varchar(255) NOT NULL,
        "value" text,
        "created_at" timestamp DEFAULT now(),
        "expires_at" timestamp,
        CONSTRAINT "auto_states_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "event_id" integer,
        "paid" boolean DEFAULT false,
        "confirmation" text DEFAULT 'pending',
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detective_cases" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "suspect_number" integer NOT NULL,
        "name" varchar(255) NOT NULL,
        "dossier" text NOT NULL,
        "clue" text NOT NULL,
        "is_killer" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detective_votes" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "suspect_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discount_vouchers" (
        "id" serial PRIMARY KEY NOT NULL,
        "code" varchar(50) NOT NULL,
        "discount_percent" integer DEFAULT 0,
        "discount_amount_pln" integer DEFAULT 0,
        "is_active" boolean DEFAULT true,
        "max_uses" integer DEFAULT 1,
        "used_count" integer DEFAULT 0,
        "expires_at" timestamp,
        CONSTRAINT "discount_vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
        "id" serial PRIMARY KEY NOT NULL,
        "type" text NOT NULL,
        "date_string" text NOT NULL,
        "description" text,
        "price" integer,
        "max_players" integer NOT NULL,
        "current_players" integer DEFAULT 0,
        "city" varchar(50) DEFAULT 'Main',
        "is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_codes" (
        "id" serial PRIMARY KEY NOT NULL,
        "code" text NOT NULL,
        "type" text NOT NULL,
        "max_uses" integer DEFAULT 1,
        "current_uses" integer DEFAULT 0,
        "expires_at" timestamp,
        "event_ids" text,
        "is_active" boolean DEFAULT true,
        CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ratings" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "rater_id" integer NOT NULL,
        "target_id" integer NOT NULL,
        "stars" integer NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reveals" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "event_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "secret_likes" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer,
        "user_id" integer,
        "target_user_id" integer,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_scores" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "question_index" integer NOT NULL,
        "points" integer DEFAULT 0,
        "is_winner" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trial_states" (
        "event_id" integer PRIMARY KEY NOT NULL,
        "is_trial_open" boolean DEFAULT false NOT NULL,
        "is_finished" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_vouchers" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "voucher_id" integer,
        "used_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "telegram_id" bigint NOT NULL,
        "username" text,
        "first_name" text,
        "name" text,
        "birth_date" text,
        "gender" text,
        "fact" text,
        "strange_story" text,
        "expectations" text,
        "profile_completed" boolean DEFAULT false,
        "city" varchar(50) DEFAULT 'Warsaw',
        "last_active" timestamp DEFAULT now(),
        "is_banned" boolean DEFAULT false,
        "ban_reason" text,
        "is_approved" boolean DEFAULT false,
        "got_profile_discount" boolean DEFAULT false,
        "is_admin" boolean DEFAULT false,
        "games_played" integer DEFAULT 0,
        "loyalty_points" integer DEFAULT 0,
        "is_corporate" boolean DEFAULT false,
        "company_name" text,
        "created_at" timestamp DEFAULT now(),
        "invited_by" bigint,
        "referral_count" integer DEFAULT 0,
        "utm_source" varchar(255),
        "referrer_id" bigint,
        CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vouchers" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "photo_file_id" text,
        "status" text DEFAULT 'pending',
        "used_in_event_id" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_paid_idx" ON "bookings" ("event_id","paid");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reveals" ADD CONSTRAINT "reveals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reveals" ADD CONSTRAINT "reveals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secret_likes" ADD CONSTRAINT "secret_likes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secret_likes" ADD CONSTRAINT "secret_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "secret_likes" ADD CONSTRAINT "secret_likes_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_scores" ADD CONSTRAINT "stock_scores_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_scores" ADD CONSTRAINT "stock_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vouchers" ADD CONSTRAINT "user_vouchers_voucher_id_discount_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "discount_vouchers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_used_in_event_id_events_id_fk" FOREIGN KEY ("used_in_event_id") REFERENCES "events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$; 
