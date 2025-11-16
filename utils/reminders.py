import asyncio
from aiogram.dispatcher import FSMContext
from config import bot

async def reminder_timer(user_id, state: FSMContext):
    await asyncio.sleep(300)  # 5 мин
    current_state = await state.get_state()
    if current_state:
        await bot.send_message(user_id, "Мы ждём твоего ответа! Продолжи запись. ⏰")