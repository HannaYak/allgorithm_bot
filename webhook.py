from flask import Flask, request
import stripe
import os
import asyncio
from dotenv import load_dotenv
from database import db, update_stats
from config import bot

load_dotenv()
app = Flask(__name__)
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

@app.route('/webhook', methods=['POST'])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError:
        return 'Invalid signature', 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = int(session.metadata['user_id'])
        game_type = session.metadata['game_type']
        game_date = session.metadata['game_date']
        restaurant = session.metadata.get('restaurant', '')
        asyncio.run(save_payment(user_id, game_type, game_date, restaurant))

    return 'OK', 200

async def save_payment(user_id, game_type, game_date, restaurant):
    await db.execute('INSERT INTO registrations (user_id, game_type, game_date, restaurant, paid) VALUES (?, ?, ?, ?, TRUE)', (user_id, game_type, game_date, restaurant))
    await db.execute('INSERT INTO visits (user_id, game_date) VALUES (?, ?)', (user_id, game_date))
    await update_stats('total_registrations')
    await update_stats('total_payments')
    await db.commit()
    await bot.send_message(user_id, f"✅ Записан на {game_type} {game_date}! Место за 3 часа. Отмена за 48ч — без возврата.", reply_markup=InlineKeyboardMarkup().add(InlineKeyboardButton('Меню', callback_data='back_main')))
    # Создай игру
    end_time = (datetime.strptime(game_date, '%Y-%m-%d') + timedelta(hours=3)).isoformat()
    await db.execute('INSERT INTO games (game_type, date, participants, end_time) VALUES (?, ?, ?, ?)', (game_type, game_date, str(user_id), end_time))
    await db.commit()
    asyncio.create_task(auto_delete_game((await db.lastrowid)))  # Из utils

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 4242)))