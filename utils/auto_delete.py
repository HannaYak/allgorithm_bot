import asyncio
from datetime import datetime
from database import db
from config import bot

async def auto_delete_game(game_id):
    cursor = await db.execute('SELECT end_time FROM games WHERE game_id = ?', (game_id,))
    end_time = (await cursor.fetchone())[0]
    end_dt = datetime.fromisoformat(end_time)
    await asyncio.sleep((end_dt - datetime.now()).total_seconds())
    await db.execute('UPDATE games SET active = FALSE WHERE game_id = ?', (game_id,))
    await db.execute('UPDATE visits SET attended = TRUE WHERE game_date = (SELECT date FROM games WHERE game_id = ?)', (game_id,))
    await db.commit()
    # Уведоми участников
    cursor = await db.execute('SELECT participants FROM games WHERE game_id = ?', (game_id,))
    participants = (await cursor.fetchone())[0].split(',')
    for p in participants:
        await bot.send_message(int(p), "Игра завершена и удалена!")