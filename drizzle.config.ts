import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  driver: "pg", // <--- ВОТ ЗДЕСЬ БЫЛА ОШИБКА, НУЖНО ИМЕННО "pg"
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
});
