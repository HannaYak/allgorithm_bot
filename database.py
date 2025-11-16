import aiosqlite

db = None

async def init_db():
    global db
    db = await aiosqlite.connect('bot.db')
    await db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            name TEXT,
            age INTEGER,
            question3 TEXT,
            completed_anketa BOOLEAN DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS registrations (
            reg_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            game_type TEXT,
            game_date TEXT,
            restaurant TEXT,
            paid BOOLEAN DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS visits (
            user_id INTEGER,
            game_date TEXT,
            attended BOOLEAN DEFAULT FALSE,
            PRIMARY KEY (user_id, game_date)
        );
        CREATE TABLE IF NOT EXISTS questions (
            q_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            question TEXT,
            answered BOOLEAN DEFAULT FALSE,
            answer TEXT
        );
        CREATE TABLE IF NOT EXISTS games (
            game_id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_type TEXT,
            date TEXT,
            participants TEXT,
            active BOOLEAN DEFAULT TRUE,
            end_time TEXT
        );
        CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY DEFAULT 0,
            total_users INTEGER DEFAULT 0,
            total_registrations INTEGER DEFAULT 0,
            total_payments INTEGER DEFAULT 0,
            total_visits INTEGER DEFAULT 0
        );
        INSERT OR IGNORE INTO stats (id) VALUES (0);
    ''')
    await db.commit()

async def update_stats(field):
    await db.execute(f'UPDATE stats SET {field} = {field} + 1 WHERE id = 0')
    await db.commit()

async def get_user(user_id):
    cursor = await db.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
    return await cursor.fetchone()

async def save_user(user_id, name, age, question3):
    await db.execute('''
        INSERT OR REPLACE INTO users (user_id, name, age, question3, completed_anketa)
        VALUES (?, ?, ?, ?, TRUE)
    ''', (user_id, name, age, question3))
    await db.commit()

# Добавь другие функции БД по необходимости (registrations, visits и т.д.)