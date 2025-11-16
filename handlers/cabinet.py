from aiogram import types, Dispatcher
from aiogram.dispatcher import FSMContext
from database import get_user, db
from keyboards import personal_menu, back_to_main_kb
from config import PAYMENT_AMOUNT_PLN
from aiogram.types import InputFile
import os

async def cabinet_handler(message: types.Message):
    await message.answer("Личный кабинет:", reply_markup=personal_menu())

async def my_anketa_handler(message: types.Message):
    user = await get_user(message.from_user.id)
    if user:
        text = f"Имя: {user[1]}\nВозраст: {user[2]}\nВопрос 3: {user[3]}"
        keyboard = InlineKeyboardMarkup()
        keyboard.add(InlineKeyboardButton('Изменить анкету', callback_data='edit_anketa'))
        keyboard.add(InlineKeyboardButton('Вернуться', callback_data='back_cabinet'))
        await message.answer(text, reply_markup=keyboard)
    else:
        await message.answer("Анкета не найдена.")

async def my_visits_handler(message: types.Message):
    user_id = message.from_user.id
    cursor = await db.execute('SELECT game_date FROM visits WHERE user_id = ? AND attended = TRUE', (user_id,))
    past = [row[0] for row in await cursor.fetchall()]
    cursor = await db.execute('SELECT game_date FROM registrations WHERE user_id = ? AND paid = TRUE AND game_date > DATE("now")', (user_id,))
    future = [row[0] for row in await cursor.fetchall()]
    text = f"Прошедшие посещения: {', '.join(past) if past else 'Нет'}\nБудущие: {', '.join(future) if future else 'Нет'}"
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('Запланировать новое', callback_data='to_games'))
    keyboard.add(InlineKeyboardButton('Вернуться', callback_data='back_cabinet'))
    await message.answer(text, reply_markup=keyboard)

async def loyalty_card_handler(message: types.Message):
    user_id = message.from_user.id
    cursor = await db.execute('SELECT COUNT(*) FROM visits WHERE user_id = ? AND attended = TRUE', (user_id,))
    count = (await cursor.fetchone())[0]
    path = f'images/card_{min(count, 12)}.png'
    caption = f"Посещений: {count}. Подарки на 6 и 12!"
    if os.path.exists(path):
        await message.answer_photo(InputFile(path), caption=caption)
    else:
        await message.answer(caption)
    await message.answer(" ", reply_markup=back_to_main_kb())

def register_cabinet_handlers(dp: Dispatcher):
    dp.register_message_handler(cabinet_handler, text='Личный кабинет')
    dp.register_message_handler(my_anketa_handler, text='Моя анкета')
    dp.register_message_handler(my_visits_handler, text='Мои посещения')
    dp.register_message_handler(loyalty_card_handler, text='Карта лояльности')
    # Добавь callback для 'edit_anketa', 'to_games', 'back_cabinet'