import { Router, Request, Response } from 'express';
import { eq, and, asc, desc } from 'drizzle-orm';
import { db } from '../db';
import { tokens, tokenTrades, tokenTradeOffers, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';

const router = Router();

// GET /api/tokens/mine — requireUser
router.get('/mine', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  try {
    const myTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.current_owner_id, userId));

    const enriched = await Promise.all(
      myTokens.map(async (token) => {
        const trades = await db
          .select({
            id: tokenTrades.id,
            from_user_id: tokenTrades.from_user_id,
            to_user_id: tokenTrades.to_user_id,
            platform_cut_cents: tokenTrades.platform_cut_cents,
            traded_at: tokenTrades.traded_at,
            note: tokenTrades.note,
          })
          .from(tokenTrades)
          .where(eq(tokenTrades.token_id, token.id))
          .orderBy(asc(tokenTrades.traded_at));
        return { ...token, trade_history: trades };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tokens/offers/mine — requireUser
// Must be before /api/tokens/:id to avoid param capture
router.get('/offers/mine', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  try {
    const offers = await db
      .select()
      .from(tokenTradeOffers)
      .where(
        and(
          eq(tokenTradeOffers.to_user_id, userId),
          eq(tokenTradeOffers.status, 'pending'),
        )
      );

    const enriched = await Promise.all(
      offers.map(async (offer) => {
        const [token] = await db
          .select()
          .from(tokens)
          .where(eq(tokens.id, offer.token_id));

        const [fromUser] = await db
          .select({ display_name: users.display_name, email: users.email })
          .from(users)
          .where(eq(users.id, offer.from_user_id));

        const displayName =
          fromUser?.display_name ?? fromUser?.email?.split('@')[0] ?? 'Unknown';

        return {
          ...offer,
          token,
          from_user_display_name: displayName,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tokens/variety/:varietyId — public
router.get('/variety/:varietyId', async (req: Request, res: Response) => {
  const varietyId = parseInt(req.params.varietyId, 10);
  if (isNaN(varietyId)) {
    res.status(400).json({ error: 'Invalid varietyId' });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(tokens)
      .where(eq(tokens.variety_id, varietyId))
      .orderBy(asc(tokens.token_number));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tokens/:id — public
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid token id' });
    return;
  }
  try {
    const [token] = await db.select().from(tokens).where(eq(tokens.id, id));
    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    // Original owner display info
    const [originalOwner] = await db
      .select({ display_name: users.display_name, email: users.email })
      .from(users)
      .where(eq(users.id, token.original_owner_id));

    // Trade history with display names
    const tradeRows = await db
      .select({
        id: tokenTrades.id,
        token_id: tokenTrades.token_id,
        from_user_id: tokenTrades.from_user_id,
        to_user_id: tokenTrades.to_user_id,
        platform_cut_cents: tokenTrades.platform_cut_cents,
        traded_at: tokenTrades.traded_at,
        note: tokenTrades.note,
      })
      .from(tokenTrades)
      .where(eq(tokenTrades.token_id, id))
      .orderBy(asc(tokenTrades.traded_at));

    // Enrich trades with display names
    const trades = await Promise.all(
      tradeRows.map(async (trade) => {
        const [fromUser] = await db
          .select({ display_name: users.display_name, email: users.email })
          .from(users)
          .where(eq(users.id, trade.from_user_id));
        const [toUser] = await db
          .select({ display_name: users.display_name, email: users.email })
          .from(users)
          .where(eq(users.id, trade.to_user_id));

        return {
          ...trade,
          from_display_name:
            fromUser?.display_name ?? fromUser?.email?.split('@')[0] ?? 'Unknown',
          to_display_name:
            toUser?.display_name ?? toUser?.email?.split('@')[0] ?? 'Unknown',
        };
      })
    );

    res.json({
      ...token,
      original_owner_display_name:
        originalOwner?.display_name ?? originalOwner?.email?.split('@')[0] ?? 'Unknown',
      trade_history: trades,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tokens/offer — requireUser
router.post('/offer', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const { token_id, to_user_id, note } = req.body;

  if (!token_id || !to_user_id) {
    res.status(400).json({ error: 'token_id and to_user_id are required' });
    return;
  }

  try {
    // Validate token exists and caller owns it
    const [token] = await db.select().from(tokens).where(eq(tokens.id, token_id));
    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    if (token.current_owner_id !== userId) {
      res.status(403).json({ error: 'You do not own this token' });
      return;
    }

    // No pending offer already exists for this token
    const [existingOffer] = await db
      .select()
      .from(tokenTradeOffers)
      .where(
        and(
          eq(tokenTradeOffers.token_id, token_id),
          eq(tokenTradeOffers.status, 'pending'),
        )
      );
    if (existingOffer) {
      res.status(409).json({ error: 'A pending offer already exists for this token' });
      return;
    }

    const [offer] = await db
      .insert(tokenTradeOffers)
      .values({
        token_id,
        from_user_id: userId,
        to_user_id,
        note: note ?? null,
        status: 'pending',
      })
      .returning();

    // Push notification to recipient
    const [me] = await db
      .select({ display_name: users.display_name, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const [recipient] = await db
      .select({ push_token: users.push_token })
      .from(users)
      .where(eq(users.id, to_user_id));

    const senderName =
      me?.display_name ?? me?.email?.split('@')[0] ?? 'Someone';

    if (recipient?.push_token) {
      sendPushNotification(recipient.push_token, {
        title: 'Token trade offer',
        body: `You have a token trade offer from @${senderName}`,
        data: { screen: 'token-offer', offer_id: offer.id },
      }).catch(() => {});
    }

    res.status(201).json({ offer_id: offer.id });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tokens/offer/:offerId/accept — requireUser
router.post('/offer/:offerId/accept', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const offerId = parseInt(req.params.offerId, 10);
  if (isNaN(offerId)) {
    res.status(400).json({ error: 'Invalid offerId' });
    return;
  }

  try {
    const [offer] = await db
      .select()
      .from(tokenTradeOffers)
      .where(eq(tokenTradeOffers.id, offerId));

    if (!offer) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }
    if (offer.to_user_id !== userId) {
      res.status(403).json({ error: 'Not your offer' });
      return;
    }
    if (offer.status !== 'pending') {
      res.status(409).json({ error: 'Offer is not pending' });
      return;
    }

    // Accept offer atomically: guard against concurrent accepts with conditional WHERE
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(tokenTradeOffers)
        .set({ status: 'accepted' })
        .where(and(eq(tokenTradeOffers.id, offerId), eq(tokenTradeOffers.status, 'pending')))
        .returning({ id: tokenTradeOffers.id });
      if (updated.length === 0) throw Object.assign(new Error('Offer already accepted or declined'), { status: 409 });

      await tx
        .update(tokens)
        .set({ current_owner_id: userId })
        .where(eq(tokens.id, offer.token_id));

      await tx.insert(tokenTrades).values({
        token_id: offer.token_id,
        from_user_id: offer.from_user_id,
        to_user_id: userId,
        platform_cut_cents: 0,
        note: offer.note,
      });
    });

    // Notify sender
    const [sender] = await db
      .select({ push_token: users.push_token })
      .from(users)
      .where(eq(users.id, offer.from_user_id));

    if (sender?.push_token) {
      sendPushNotification(sender.push_token, {
        title: 'Token trade accepted',
        body: 'Your token trade was accepted.',
        data: { screen: 'tokens', token_id: offer.token_id },
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tokens/offer/:offerId/decline — requireUser
router.post('/offer/:offerId/decline', requireUser, async (req: any, res: Response) => {
  const userId: number = req.userId;
  const offerId = parseInt(req.params.offerId, 10);
  if (isNaN(offerId)) {
    res.status(400).json({ error: 'Invalid offerId' });
    return;
  }

  try {
    const [offer] = await db
      .select()
      .from(tokenTradeOffers)
      .where(eq(tokenTradeOffers.id, offerId));

    if (!offer) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }
    if (offer.to_user_id !== userId) {
      res.status(403).json({ error: 'Not your offer' });
      return;
    }

    await db
      .update(tokenTradeOffers)
      .set({ status: 'declined' })
      .where(eq(tokenTradeOffers.id, offerId));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
