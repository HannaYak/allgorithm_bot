from aiogram import types, Dispatcher
from aiogram.dispatcher import FSMContext
from aiogram.dispatcher.filters.state import State, StatesGroup
from config import stripe, WEBHOOK_URL, PAYMENT_AMOUNT_PLN, CURRENCY, GAME_RULES
from keyboards import games_menu, rules_confirm_kb, week_kb
from database import db
from datetime import datetime, timedelta
import asyncio

class Registration(StatesGroup):
    game_type = State()
    rules_confirm = State()
    week_choice = State()
    day_choice = State()
    payment = State()

async def games_handler(message: types.Message):
    await message.answer("Выбери игру:", reply_markup=games_menu())

async def game_start_handler(message: types.Message, state: FSMContext):
    game_map = {
        'Meet&Eat': 'meet_eat',
        'Лок Сток': 'lock_stock',
        'Бар Лжецов': 'bar_liar',
        'Быстрые Свидания': 'quick_dates'
    }
    game_type = game_map.get(message.text, 'meet_eat')
    if game_type == 'quick_dates':
        user = await db.execute('SELECT age FROM users WHERE user_id = ?', (message.from_user.id,))
        age = (await user.fetchone())[0]
        if age < 18:
            await message.answer("Доступ запрещён для <18 лет.")
            return
    await state.update_data(game_type=game_type)
    await Registration.rules_confirm.set()
    await message.answer(GAME_RULES[game_type], reply_markup=rules_confirm_kb())

async def continue_reg(callback: types.CallbackQuery, state: FSMContext):
    await Registration.week_choice.set()
    await callback.message.edit_text('Выбери неделю:', reply_markup=week_kb())
    asyncio.create_task(reminder(callback.from_user.id, state))

async def reminder(user_id, state: FSMContext):
    await asyncio.sleep(300)  # 5 мин
    if await state.get_state():
        await bot.send_message(user_id, "Мы ждём твоего выбора! ⏳")

async def choose_week(callback: types.CallbackQuery, state: FSMContext):
    week = callback.data.split('_')[1]
    await state.update_data(week=week)
    await Registration.day_choice.set()
    data = await state.get_data()
    game_type = data['game_type']
    start_date = datetime.now() if week == 'current' else datetime.now() + timedelta(days=7)
    keyboard = InlineKeyboardMarkup(row_width=3)
    if game_type == 'meet_eat':
        options = [
            (4, "Итальянская кухня"),
            (5, "Азиатская кухня"),
            (6, "Мексиканская кухня")
        ]
        for days, kitchen in options:
            date = start_date + timedelta(days=days)
            callback_data = f"day_meet_eat_{date.strftime('%Y-%m-%d')}_{kitchen}"
            keyboard.add(InlineKeyboardButton(f"{kitchen} ({date.strftime('%d.%m')}) - {PAYMENT_AMOUNT_PLN} PLN", callback_data=callback_data))
    else:
        for i in range(7):
            date = start_date + timedelta(days=i)
            callback_data = f"day_{game_type}_{date.strftime('%Y-%m-%d')}"
            keyboard.insert(InlineKeyboardButton(f"{date.strftime('%A %d.%m')} - {PAYMENT_AMOUNT_PLN} PLN", callback_data=callback_data))
    await callback.message.edit_text('Выбери день:', reply_markup=keyboard)

async def choose_day(callback: types.CallbackQuery, state: FSMContext):
    parts = callback.data.split('_', 2)
    game_type = parts[1]
    game_date = parts[2]
    restaurant = parts[3] if len(parts) > 3 else None
    await state.update_data(game_date=game_date, restaurant=restaurant)
    await Registration.payment.set()
    session = stripe.checkout.Session.create(
        payment_method_types=['card', 'blik', 'p24'],
        line_items=[{
            'price_data': {
                'currency': CURRENCY.lower(),
                'product_data': {'name': f'{game_type} {game_date}'},
                'unit_amount': PAYMENT_AMOUNT_PLN * 100,
            },
            'quantity': 1,
        }],
        mode='payment',
        success_url=f"{WEBHOOK_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{WEBHOOK_URL}/cancel",
        metadata={'user_id': str(callback.from_user.id), 'game_type': game_type, 'game_date': game_date, 'restaurant': restaurant or ''}
    )
    keyboard = InlineKeyboardMarkup().add(InlineKeyboardButton('Оплатить', url=session.url))
    await callback.message.edit_text(f'Сумма: {PAYMENT_AMOUNT_PLN} PLN за {game_date}.', reply_markup=keyboard)

def register_games_handlers(dp: Dispatcher):
    dp.register_message_handler(games_handler, text='Игры')
    dp.register_message_handler(game_start_handler, text=['Meet&Eat', 'Лок Сток', 'Бар Лжецов', 'Быстрые Свидания'], state=None)
    dp.register_callback_query_handler(continue_reg, lambda c: c.data == 'reg_continue', state=Registration.rules_confirm)
    dp.register_callback_query_handler(choose_week, lambda c: c.data.startswith('week_'), state=Registration.week_choice)
    dp.register_callback_query_handler(choose_day, lambda c: c.data.startswith('day_'), state=Registration.day_choice)
    # Добавь другие callback