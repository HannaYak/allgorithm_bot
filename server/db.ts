import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { migrate } from "drizzle-orm/node-postgres/migrator"; // Импортируем мигратор

const { Pool } = pg;

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      console.log("[Database] Connecting...");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
      
      _db = drizzle(pool, { schema });
      
      // 🔥 АВТОМАТИЧЕСКАЯ МИГРАЦИЯ ПРИ СТАРТЕ
      console.log("[Database] Running migrations...");
      await migrate(_db, { migrationsFolder: "./drizzle" });
      console.log("[Database] Migrations applied successfully");

    } catch (error) {
      console.error("[Database] Failed to connect or migrate:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(userData: typeof users.$inferInsert): Promise<void> {
  const db = await getDb();
  if (!db || !userData.telegramId) return;

  try {
    await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.telegramId,
      set: {
        name: userData.name,
        email: userData.email,
        role: userData.role,
        lastSignedIn: new Date(),
      },
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
  }
}

export async function getUserByTelegramId(telegramId: string) {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (e) {
    console.error("Error getting user:", e);
    return undefined;
  }
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
