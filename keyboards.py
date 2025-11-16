from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton

def main_menu():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    keyboard.add(KeyboardButton('Личный кабинет'), KeyboardButton('Игры'))
    keyboard.add(KeyboardButton('Правила'), KeyboardButton('Помощь'))
    return keyboard

def games_menu():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True)
    keyboard.add(KeyboardButton('Meet&Eat'), KeyboardButton('Лок Сток'))
    keyboard.add(KeyboardButton('Бар Лжецов'), KeyboardButton('Быстрые Свидания'))
    keyboard.add(KeyboardButton('Вернуться в главное меню'))
    return keyboard

def personal_menu():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True)
    keyboard.add(KeyboardButton('Моя анкета'), KeyboardButton('Мои посещения'))
    keyboard.add(KeyboardButton('Карта лояльности'), KeyboardButton('Вернуться в главное меню'))
    return keyboard

def rules_confirm_kb():
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('Продолжить к записи', callback_data='reg_continue'))
    keyboard.add(InlineKeyboardButton('Вернуться в игры', callback_data='reg_back'))
    return keyboard

def week_kb():
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('Ближайшая неделя', callback_data='week_current'))
    keyboard.add(InlineKeyboardButton('Следующая неделя', callback_data='week_next'))
    return keyboard

def back_to_main_kb():
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton('Вернуться в главное меню', callback_data='back_main'))
    return keyboard