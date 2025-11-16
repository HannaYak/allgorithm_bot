from aiogram import types, Dispatcher
from aiogram.dispatcher import FSMContext
from aiogram.dispatcher.filters.state import State, StatesGroup
from database import init_db, update_stats, get_user, save_user
from keyboards import main_menu
from config import INTRO_TEXT

class Anketa(StatesGroup):
    name = State()
    age = State()
    question3 = State()

async def start_handler(message: types.Message):
    user_id = message.from_user.id
    user = await get_user(user_id)
    if user and user[4]:  # completed_anketa
        await message.answer(f"Привет, {user[1]}! Добро пожаловать обратно.", reply_markup=main_menu())
    else:
        await message.answer(INTRO_TEXT)
        keyboard = ReplyKeyboardMarkup(resize_keyboard=True).add(KeyboardButton('Заполнить анкету'))
        await message.answer("Заполни анкету для начала:", reply_markup=keyboard)

async def anketa_start(message: types.Message, state: FSMContext):
    await Anketa.name.set()
    await message.answer("Введи своё имя:")

async def process_name(message: types.Message, state: FSMContext):
    await state.update_data(name=message.text)
    await Anketa.age.set()
    await message.answer("Введи свой возраст:")

async def process_age(message: types.Message, state: FSMContext):
    try:
        age = int(message.text)
        await state.update_data(age=age)
        if age < 18:
            await message.answer("⚠️ Мы не несём ответственности за участие. Доступ к свиданиям ограничен.")
        await message.answer("⚠️ Если соврал о возрасте — ответственность на тебе.")
        await Anketa.question3.set()
        await message.answer("Введи ответ на третий вопрос (например, любимое хобби):")
    except ValueError:
        await message.answer("Введи число для возраста!")

async def process_question3(message: types.Message, state: FSMContext):
    data = await state.get_data()
    await save_user(message.from_user.id, data['name'], data['age'], message.text)
    await update_stats('total_users')
    await state.finish()
    await message.answer(f"Анкета заполнена, {data['name']}! 🎉", reply_markup=main_menu())

def register_start_handlers(dp: Dispatcher):
    dp.register_message_handler(start_handler, commands=['start'])
    dp.register_message_handler(anketa_start, text='Заполнить анкету', state=None)
    dp.register_message_handler(process_name, state=Anketa.name)
    dp.register_message_handler(process_age, state=Anketa.age)
    dp.register_message_handler(process_question3, state=Anketa.question3)