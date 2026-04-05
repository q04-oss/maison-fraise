import { Router, Request, Response } from 'express';
import { eq, and, asc, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  contentTokens,
  contentTokenTrades,
  contentTokenTradeOffers,
  users,
  portalContent,
} from '../db/schema';
import { requireUser } from '../lib/auth';
import { sendPushNotification } from '../lib/push';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichToken(token: any) {
  const [creator] = await db
    .select({ display_name: users.display_name, email: users.email })
    .from(users)
    .where(eq(users.id, token.creator_user_id));

  const trades = await db
    .select()
    .from(contentTokenTrades)
    .where(eq(contentTokenTrades.token_id, token.id))
    .orderBy(asc(contentTokenTrades.traded_at));

  const enrichedTrades = await Promise.all(
    trades.map(async (trade) => {
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
        from_display_name: fromUser?.display_name ?? fromUser?.email?.split('@')[0] ?? 'unknown',
        to_display_name: toUser?.display_name ?? toUser?.email?.split('@')[0] ?? 'unknown',
      };
    }),
  );

  return {
    ...token,
    creator_display_name: creator?.display_name ?? creator?.email?.split('@')[0] ?? 'unknown',
    trade_history: enrichedTrades,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/content-tokens/mine — my current holdings
router.get('/mine', requireUser, async (req: any, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(contentTokens)
      .where(eq(contentTokens.current_owner_id, req.userId))
      .orderBy(desc(contentTokens.minted_at));

    const enriched = await Promise.all(rows.map(enrichToken));
    res.json(enriched);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/content-tokens/offers/mine — pending incoming trade offers
router.get('/offers/mine', requireUser, async (req: any, res: Response) => {
  try {
    const offers = await db
      .select()
      .from(contentTokenTradeOffers)
      .where(
        and(
          eq(contentTokenTradeOffers.to_user_id, req.userId),
          eq(contentTokenTradeOffers.status, 'pending'),
        ),
      );

    const enriched = await Promise.all(
      offers.map(async (offer) => {
        const [token] = await db
          .select()
          .from(contentTokens)
          .where(eq(contentTokens.id, offer.token_id));

        const [fromUser] = await db
          .select({ display_name: users.display_name, email: users.email })
          .from(users)
          .where(eq(users.id, offer.from_user_id));

        return {
          ...offer,
          token,
          from_user_display_name:
            fromUser?.display_name ?? fromUser?.email?.split('@')[0] ?? 'unknown',
        };
      }),
    );

    res.json(enriched);
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/content-tokens/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [token] = await db.select().from(contentTokens).where(eq(contentTokens.id, id));
    if (!token) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(await enrichToken(token));
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/content-tokens/offer — create a trade offer
router.post('/offer', requireUser, async (req: any, res: Response) => {
  const { token_id, to_user_id, note } = req.body;
  if (!token_id || !to_user_id) {
    res.status(400).json({ error: 'token_id and to_user_id are required' });
    return;
  }

  try {
    const [token] = await db
      .select()
      .from(contentTokens)
      .where(eq(contentTokens.id, token_id));

    if (!token) { res.status(404).json({ error: 'token_not_found' }); return; }
    if (token.current_owner_id !== req.userId) {
      res.status(403).json({ error: 'not_your_token' });
      return;
    }

    const [existing] = await db
      .select()
      .from(contentTokenTradeOffers)
      .where(
        and(
          eq(contentTokenTradeOffers.token_id, token_id),
          eq(contentTokenTradeOffers.status, 'pending'),
        ),
      );
    if (existing) { res.status(409).json({ error: 'pending_offer_exists' }); return; }

    const [offer] = await db
      .insert(contentTokenTradeOffers)
      .values({ token_id, from_user_id: req.userId, to_user_id, note: note ?? null })
      .returning();

    // Push notification
    const [me] = await db
      .select({ display_name: users.display_name, email: users.email })
      .from(users)
      .where(eq(users.id, req.userId));
    const [recipient] = await db
      .select({ push_token: users.push_token })
      .from(users)
      .where(eq(users.id, to_user_id));

    const senderName = me?.display_name ?? me?.email?.split('@')[0] ?? 'Someone';
    if (recipient?.push_token) {
      sendPushNotification(recipient.push_token, {
        title: 'Card trade offer',
        body: `@${senderName} wants to trade a card with you`,
        data: { screen: 'token-offer' },
      }).catch(() => {});
    }

    res.status(201).json({ offer_id: offer.id });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/content-tokens/offer/:offerId/accept
router.post('/offer/:offerId/accept', requireUser, async (req: any, res: Response) => {
  const offerId = parseInt(req.params.offerId, 10);
  if (isNaN(offerId)) { res.status(400).json({ error: 'invalid_offer_id' }); return; }

  try {
    const [offer] = await db
      .select()
      .from(contentTokenTradeOffers)
      .where(eq(contentTokenTradeOffers.id, offerId));

    if (!offer) { res.status(404).json({ error: 'not_found' }); return; }
    if (offer.to_user_id !== req.userId) { res.status(403).json({ error: 'not_your_offer' }); return; }
    if (offer.status !== 'pending') { res.status(409).json({ error: 'offer_not_pending' }); return; }

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(contentTokenTradeOffers)
        .set({ status: 'accepted' })
        .where(
          and(
            eq(contentTokenTradeOffers.id, offerId),
            eq(contentTokenTradeOffers.status, 'pending'),
          ),
        )
        .returning({ id: contentTokenTradeOffers.id });
      if (updated.length === 0)
        throw Object.assign(new Error('offer_already_resolved'), { status: 409 });

      await tx
        .update(contentTokens)
        .set({ current_owner_id: req.userId })
        .where(eq(contentTokens.id, offer.token_id));

      await tx.insert(contentTokenTrades).values({
        token_id: offer.token_id,
        from_user_id: offer.from_user_id,
        to_user_id: req.userId,
        note: offer.note,
      });
    });

    const [sender] = await db
      .select({ push_token: users.push_token })
      .from(users)
      .where(eq(users.id, offer.from_user_id));

    if (sender?.push_token) {
      sendPushNotification(sender.push_token, {
        title: 'Card trade accepted',
        body: 'Your card trade was accepted.',
        data: { screen: 'tokens', token_id: offer.token_id },
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ error: err.message }); return; }
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/content-tokens/offer/:offerId/decline
router.post('/offer/:offerId/decline', requireUser, async (req: any, res: Response) => {
  const offerId = parseInt(req.params.offerId, 10);
  if (isNaN(offerId)) { res.status(400).json({ error: 'invalid_offer_id' }); return; }

  try {
    const [offer] = await db
      .select()
      .from(contentTokenTradeOffers)
      .where(eq(contentTokenTradeOffers.id, offerId));

    if (!offer) { res.status(404).json({ error: 'not_found' }); return; }
    if (offer.to_user_id !== req.userId) { res.status(403).json({ error: 'not_your_offer' }); return; }

    await db
      .update(contentTokenTradeOffers)
      .set({ status: 'declined' })
      .where(eq(contentTokenTradeOffers.id, offerId));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/content-tokens/:id/print — request a physical card
router.post('/:id/print', requireUser, async (req: any, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { shipping_address } = req.body;
  if (!shipping_address || typeof shipping_address !== 'object') {
    res.status(400).json({ error: 'shipping_address object required' });
    return;
  }

  try {
    // Ownership check and update in one atomic operation: WHERE clause enforces
    // current_owner_id and null print_status so a concurrent trade cannot race
    // a print request between the fetch and update.
    const updated = await db
      .update(contentTokens)
      .set({
        print_status: 'requested',
        shipping_address: JSON.stringify(shipping_address),
        print_requested_at: new Date(),
      })
      .where(
        and(
          eq(contentTokens.id, id),
          eq(contentTokens.current_owner_id, req.userId),
          sql`${contentTokens.print_status} IS NULL`,
        ),
      )
      .returning({ id: contentTokens.id, print_status: contentTokens.print_status });

    if (updated.length === 0) {
      // Determine why — token doesn't exist, not owner, or already requested
      const [token] = await db.select().from(contentTokens).where(eq(contentTokens.id, id));
      if (!token) { res.status(404).json({ error: 'not_found' }); return; }
      if (token.current_owner_id !== req.userId) {
        res.status(403).json({ error: 'not_your_token' });
        return;
      }
      res.status(409).json({ error: 'print_already_requested', status: token.print_status });
      return;
    }

    res.json({ ok: true, print_status: 'requested' });
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
