import { Router, Request, Response } from 'express';
import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { eveningTokens, users, nfcConnections, messages, businesses, reservationOffers } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

db.execute(sql`
  CREATE TABLE IF NOT EXISTS evening_tokens (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL UNIQUE,
    user_a_id INTEGER NOT NULL REFERENCES users(id),
    user_b_id INTEGER NOT NULL REFERENCES users(id),
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    offer_id INTEGER NOT NULL REFERENCES reservation_offers(id),
    window_closes_at TIMESTAMP NOT NULL,
    user_a_confirmed BOOLEAN NOT NULL DEFAULT false,
    user_b_confirmed BOOLEAN NOT NULL DEFAULT false,
    minted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// GET /api/evening-tokens/mine — user's minted evening tokens
router.get('/mine', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  try {
    const tokens = await db.select({
      id: eveningTokens.id,
      booking_id: eveningTokens.booking_id,
      minted_at: eveningTokens.minted_at,
      window_closes_at: eveningTokens.window_closes_at,
      user_a_id: eveningTokens.user_a_id,
      user_b_id: eveningTokens.user_b_id,
      user_a_confirmed: eveningTokens.user_a_confirmed,
      user_b_confirmed: eveningTokens.user_b_confirmed,
      business_name: businesses.name,
      offer_title: reservationOffers.title,
      offer_date: reservationOffers.reservation_date,
    })
    .from(eveningTokens)
    .innerJoin(businesses, eq(eveningTokens.business_id, businesses.id))
    .innerJoin(reservationOffers, eq(eveningTokens.offer_id, reservationOffers.id))
    .where(
      and(
        or(eq(eveningTokens.user_a_id, userId), eq(eveningTokens.user_b_id, userId)),
        sql`${eveningTokens.minted_at} IS NOT NULL`,
      )
    )
    .orderBy(sql`${eveningTokens.minted_at} DESC`);

    // Enrich with companion name
    const enriched = await Promise.all(tokens.map(async (t) => {
      const companionId = t.user_a_id === userId ? t.user_b_id : t.user_a_id;
      const [companion] = await db.select({ display_name: users.display_name, user_code: users.user_code })
        .from(users).where(eq(users.id, companionId));
      return {
        ...t,
        companion_name: companion?.display_name ?? companion?.user_code ?? 'Anonymous',
      };
    }));

    res.json(enriched);
  } catch (err) {
    logger.error(`evening-tokens /mine error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/evening-tokens/:bookingId/confirm — user confirms "remember this evening"
router.post('/:bookingId/confirm', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const bookingId = parseInt(req.params.bookingId, 10);
  if (isNaN(bookingId)) { res.status(400).json({ error: 'invalid id' }); return; }

  try {
    const [token] = await db.select().from(eveningTokens)
      .where(eq(eveningTokens.booking_id, bookingId));
    if (!token) { res.status(404).json({ error: 'not_found' }); return; }
    if (token.minted_at) { res.json({ status: 'already_minted' }); return; }
    if (new Date() > token.window_closes_at) { res.status(410).json({ error: 'window_expired' }); return; }

    const isA = token.user_a_id === userId;
    const isB = token.user_b_id === userId;
    if (!isA && !isB) { res.status(403).json({ error: 'not_participant' }); return; }

    // Atomically set confirmation flag + attempt mint in one transaction
    const mintedNow = await db.transaction(async (tx) => {
      const patch = isA ? { user_a_confirmed: true } : { user_b_confirmed: true };
      const [updated] = await tx.update(eveningTokens).set(patch)
        .where(eq(eveningTokens.booking_id, bookingId))
        .returning();

      const bothConfirmed = updated.user_a_confirmed && updated.user_b_confirmed;
      if (!bothConfirmed) return false;

      // Atomic mint guard — WHERE minted_at IS NULL prevents double-mint
      const [minted] = await tx.update(eveningTokens)
        .set({ minted_at: new Date() })
        .where(and(
          eq(eveningTokens.booking_id, bookingId),
          sql`${eveningTokens.minted_at} IS NULL`,
        ))
        .returning({ id: eveningTokens.id });

      return !!minted;
    });

    if (mintedNow) {
      // Create NFC connection between the two users (enables messaging)
      await db.insert(nfcConnections).values({
        user_a: token.user_a_id,
        user_b: token.user_b_id,
      }).onConflictDoNothing();

      // Update both users' dinner_invite cards to 'minted'
      await db.execute(sql`
        UPDATE messages SET metadata = jsonb_set(metadata, '{status}', '"minted"'::jsonb)
        WHERE type = 'dinner_invite'
          AND (metadata->>'booking_id')::int = ${bookingId}
      `);

      // Set companion_user_id on each card so iOS can navigate to the message thread
      await db.execute(sql`
        UPDATE messages SET metadata = jsonb_set(metadata, '{companion_user_id}', to_jsonb(${token.user_b_id}::int))
        WHERE type = 'dinner_invite'
          AND (metadata->>'booking_id')::int = ${bookingId}
          AND recipient_id = ${token.user_a_id}
      `);
      await db.execute(sql`
        UPDATE messages SET metadata = jsonb_set(metadata, '{companion_user_id}', to_jsonb(${token.user_a_id}::int))
        WHERE type = 'dinner_invite'
          AND (metadata->>'booking_id')::int = ${bookingId}
          AND recipient_id = ${token.user_b_id}
      `);

      res.json({ status: 'minted' });
    } else {
      res.json({ status: 'confirmed', waiting_for_companion: true });
    }
  } catch (err) {
    logger.error(`evening-tokens confirm error: ${String(err)}`);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
