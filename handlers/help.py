from aiogram import types, Dispatcher
from aiogram.dispatcher import FSMContext
from database import db
from config import ADMIN_ID

class HelpState(StatesGroup):
    question = State()

async def help_handler(message: types.Message, state: FSMContext):
    await HelpState.question.set()
    await message.answer("Напиши свой вопрос — админ ответит в чате.")

async def process_question(message: types.Message, state: FSMContext):
    await db.execute('INSERT INTO questions (user_id, question) VALUES (?, ?)', (message.from_user.id, message.text))
    await db.commit()
    await bot.send_message(ADMIN_ID, f"Новый вопрос от {message.from_user.id}: {message.text}")
    await message.answer("Вопрос отправлен! Жди ответа.")
    await state.finish()

@dp.message_handler(commands=['answer'])
async def admin_answer(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    parts = message.text.split(' ', 2)
    if len(parts) < 3:
        await message.answer("Формат: /answer q_id текст")
        return
    q_id = int(parts[1])
    answer = parts[2]
    cursor = await db.execute('SELECT user_id FROM questions WHERE q_id = ?', (q_id,))
    row = await cursor.fetchone()
    if row:
        user_id = row[0]
        await db.execute('UPDATE questions SET answered = TRUE, answer = ? WHERE q_id = ?', (answer, q_id))
        await db.commit()
        keyboard = InlineKeyboardMarkup()
        keyboard.add(InlineKeyboardButton('Ещё вопрос', callback_data='more_help'))
        keyboard.add(InlineKeyboardButton('Вернуться в меню', callback_data='back_main'))
        await bot.send_message(user_id, f"Ответ: {answer}", reply_markup=keyboard)

def register_help_handlers(dp: Dispatcher):
    dp.register_message_handler(help_handler, text='Помощь')
    dp.register_message_handler(process_question, state=HelpState.question)