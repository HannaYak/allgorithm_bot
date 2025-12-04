// server/bot/payment.ts
import Stripe from 'stripe';
import { getDb } from '../db';
import { gameRegistrations } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

// Инициализация Stripe (если ключа нет, будет заглушка)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia', // Используем актуальную версию API
});

export async function createPaymentIntent(
  userId: number,
  eventId: number,
  amount: number, // в копейках/центах
  description: string
) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[Payment] STRIPE_SECRET_KEY не установлен. Платёж симулируется.');
    return { success: true, paymentIntentId: 'simulated_' + Date.now(), clientSecret: 'sim_secret' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'pln', // Валюта из ТЗ (злотые)
      description,
      metadata: {
        userId: userId.toString(),
        eventId: eventId.toString(),
      },
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error('[Payment] Error creating payment:', error);
    return { success: false, error: 'Payment creation failed' };
  }
}

export async function confirmPayment(paymentIntentId: string) {
  const db = await getDb();
  if (!db) return false;

  // Если это симуляция
  if (paymentIntentId.startsWith('simulated_')) {
      return true; 
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const userId = parseInt(paymentIntent.metadata?.userId || '0');
      const eventId = parseInt(paymentIntent.metadata?.eventId || '0');

      if (userId && eventId) {
        await db
          .update(gameRegistrations)
          .set({ paymentStatus: 'completed', status: 'confirmed' })
          .where(
            and(
              eq(gameRegistrations.userId, userId),
              eq(gameRegistrations.eventId, eventId)
            )
          );
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Payment] Error confirming payment:', error);
    return false;
  }
}
