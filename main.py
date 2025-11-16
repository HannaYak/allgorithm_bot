import asyncio
from aiogram import Bot, Dispatcher, executor, types
from config import BOT_TOKEN
from database import init_db
from handlers.start import register_start_handlers
from handlers.cabinet import register_cabinet_handlers
from handlers.games import register_games_handlers
from handlers.help import register_help_handlers
from handlers.admin import register_admin_handlers
from keyboards import back_to_main_kb

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)

async def on_startup(_):
    await init_db()

def register_all_handlers():
    register_start_handlers(dp)
    register_cabinet_handlers(dp)
    register_games_handlers(dp)
    register_help_handlers(dp)
    register_admin_handlers(dp)
    # Общий back
    @dp.callback_query_handler(lambda c: c.data == 'back_main')
    async def back_main(callback: types.CallbackQuery):
        await callback.message.edit_text("Главное меню:", reply_markup=back_to_main_kb())

if __name__ == '__main__':
    register_all_handlers()
    executor.start_polling(dp, on_startup=on_startup, skip_updates=True)