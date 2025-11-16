from aiogram import types, Dispatcher
from database import db
from config import ADMIN_ID
from keyboards import main_menu

@dp.message_handler(commands=['admin'])
async def admin_panel(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    cursor = await db.execute('SELECT * FROM stats WHERE id = 0')
    stats = await cursor.fetchone()
    text = f"Статистика:\nПользователи: {stats[1]}\nРегистрации: {stats[2]}\nОплаты: {stats[3]}\nПосещения: {stats[4]}"
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True).add(KeyboardButton('Управлять играми'), KeyboardButton('Вернуться'))
    await message.answer(text, reply_markup=keyboard)

async def manage_games(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    cursor = await db.execute('SELECT game_id, game_type, date FROM games WHERE active = TRUE')
    games = await cursor.fetchall()
    text = "\n".join([f"{g[0]}: {g[1]} {g[2]}" for g in games]) or "Нет активных игр"
    await message.answer(text + "\nКоманды: /delete id /edit id new_date")

def register_admin_handlers(dp: Dispatcher):
    dp.register_message_handler(admin_panel, commands=['admin'], user_id=ADMIN_ID)
    dp.register_message_handler(manage_games, text='Управлять играми', user_id=ADMIN_ID)