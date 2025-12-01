import { getDb } from '../db';
import { 
  games, 
  gameEvents, 
  gameRegistrations, 
  stockKnowQuestions,
  fastDatesMatches,
  Game,
  GameEvent,
  InsertGameEvent
} from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Initialize default games in the database
 */
export async function initializeDefaultGames() {
  const db = await getDb();
  if (!db) return;

  try {
    // Check if games already exist
    const existingGames = await db.select().from(games);
    if (existingGames.length > 0) {
      return; // Games already initialized
    }

    // Create default games
    await db.insert(games).values([
      {
        type: 'talk_toast',
        name: 'Talk & Toast',
        description: 'Один большой стол, никто не меняется. Викторина из фактов анкет участников.',
        maxParticipants: 8,
        duration: 120, // 2 hours
      },
      {
        type: 'stock_know',
        name: 'Stock & Know',
        description: '12 вопросов, подсказки, определение победителя.',
        maxParticipants: 8,
        duration: 120,
      },
      {
        type: 'fast_dates',
        name: 'Быстрые свидания',
        description: 'Раунды встреч, матчи в конце.',
        maxParticipants: 14,
        duration: 120,
      },
    ]);

    console.log('[Games] Default games initialized');
  } catch (error) {
    console.error('[Games] Error initializing games:', error);
  }
}

/**
 * Get all available games
 */
export async function getAllGames(): Promise<Game[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(games);
  } catch (error) {
    console.error('[Games] Error fetching games:', error);
    return [];
  }
}

/**
 * Get upcoming game events for the next 2 weeks
 */
export async function getUpcomingGameEvents(gameType: string, days: number = 14): Promise<GameEvent[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const game = await db
      .select()
      .from(games)
      .where(eq(games.type, gameType as any))
      .limit(1);

    if (game.length === 0) return [];

    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const events = await db
      .select()
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.gameId, game[0].id),
          eq(gameEvents.status, 'scheduled'),
          // Add date range filtering if needed
        )
      );

    return events;
  } catch (error) {
    console.error('[Games] Error fetching upcoming events:', error);
    return [];
  }
}

/**
 * Register user for a game event
 */
export async function registerUserForGame(
  userId: number,
  eventId: number
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: 'Database error' };
  }

  try {
    // Check if event exists and has space
    const event = await db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.id, eventId))
      .limit(1);

    if (event.length === 0) {
      return { success: false, message: 'Event not found' };
    }

    const gameEvent = event[0];

    // Check if event is full
    if (gameEvent.currentParticipants >= gameEvent.maxParticipants) {
      return { success: false, message: 'Event is full' };
    }

    // Check if user is already registered
    const existingReg = await db
      .select()
      .from(gameRegistrations)
      .where(
        and(
          eq(gameRegistrations.userId, userId),
          eq(gameRegistrations.eventId, eventId)
        )
      )
      .limit(1);

    if (existingReg.length > 0) {
      return { success: false, message: 'Already registered for this event' };
    }

    // Register user
    await db.insert(gameRegistrations).values({
      userId,
      eventId,
      status: 'registered',
      paymentStatus: 'pending',
    });

    // Update participant count
    await db
      .update(gameEvents)
      .set({ currentParticipants: gameEvent.currentParticipants + 1 })
      .where(eq(gameEvents.id, eventId));

    return { success: true, message: 'Successfully registered for the event' };
  } catch (error) {
    console.error('[Games] Error registering user:', error);
    return { success: false, message: 'Registration error' };
  }
}

/**
 * Get user's registered games
 */
export async function getUserRegisteredGames(userId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    const registrations = await db
      .select()
      .from(gameRegistrations)
      .where(eq(gameRegistrations.userId, userId));

    // Fetch event details for each registration
    const results = [];
    for (const reg of registrations) {
      const event = await db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.id, reg.eventId))
        .limit(1);

      if (event.length > 0) {
        const game = await db
          .select()
          .from(games)
          .where(eq(games.id, event[0].gameId))
          .limit(1);

        results.push({
          registration: reg,
          event: event[0],
          game: game[0],
        });
      }
    }

    return results;
  } catch (error) {
    console.error('[Games] Error fetching user games:', error);
    return [];
  }
}

/**
 * Create a Stock & Know question
 */
export async function createStockKnowQuestion(
  eventId: number,
  questionNumber: number,
  question: string,
  correctAnswer: string,
  hints: string[]
) {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(stockKnowQuestions).values({
      eventId,
      questionNumber,
      question,
      correctAnswer,
      hints: JSON.stringify(hints),
      currentRound: 0,
    });

    return result;
  } catch (error) {
    console.error('[Games] Error creating question:', error);
    return null;
  }
}

/**
 * Get Stock & Know questions for an event
 */
export async function getStockKnowQuestions(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(stockKnowQuestions)
      .where(eq(stockKnowQuestions.eventId, eventId));
  } catch (error) {
    console.error('[Games] Error fetching questions:', error);
    return [];
  }
}

/**
 * Record a Fast Dates match
 */
export async function recordFastDatesMatch(
  eventId: number,
  maleUserId: number,
  femaleUserId: number,
  maleVote: boolean,
  femaleVote: boolean
) {
  const db = await getDb();
  if (!db) return null;

  try {
    const isMatch = maleVote && femaleVote;

    const result = await db.insert(fastDatesMatches).values({
      eventId,
      maleUserId,
      femaleUserId,
      maleVote,
      femaleVote,
      isMatch,
    });

    return result;
  } catch (error) {
    console.error('[Games] Error recording match:', error);
    return null;
  }
}

/**
 * Get Fast Dates matches for an event
 */
export async function getFastDatesMatches(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(fastDatesMatches)
      .where(eq(fastDatesMatches.eventId, eventId));
  } catch (error) {
    console.error('[Games] Error fetching matches:', error);
    return [];
  }
}
