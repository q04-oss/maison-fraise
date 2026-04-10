import { Router, Request, Response, NextFunction } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db';
import { artPitches, artworks, artAuctions, artAcquisitions, artBids, artManagementFees, users } from '../db/schema';
import { stripe } from '../lib/stripe';
import { logger } from '../lib/logger';

const router = Router();

function requirePin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers['x-admin-pin'];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-Admin-PIN header' });
    return;
  }
  next();
}

// GET /api/art-admin/pitches — all pitches
router.get('/pitches', requirePin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: artPitches.id,
        title: artPitches.title,
        abstract: artPitches.abstract,
        reference_image_url: artPitches.reference_image_url,
        status: artPitches.status,
        grant_amount_cents: artPitches.grant_amount_cents,
        admin_note: artPitches.admin_note,
        created_at: artPitches.created_at,
        artist_name: users.display_name,
        artist_id: artPitches.user_id,
      })
      .from(artPitches)
      .leftJoin(users, eq(artPitches.user_id, users.id))
      .orderBy(desc(artPitches.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/art-admin/pitches/:id/approve
router.patch('/pitches/:id/approve', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { grant_amount_cents, admin_note } = req.body;

  if (isNaN(id) || !grant_amount_cents || typeof grant_amount_cents !== 'number') {
    res.status(400).json({ error: 'grant_amount_cents required' });
    return;
  }

  try {
    const [pitch] = await db
      .update(artPitches)
      .set({
        status: 'approved',
        grant_amount_cents,
        admin_note: admin_note ?? null,
        reviewed_at: new Date(),
      })
      .where(eq(artPitches.id, id))
      .returning();

    res.json(pitch);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// PATCH /api/art-admin/pitches/:id/reject
router.patch('/pitches/:id/reject', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { admin_note } = req.body;

  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [pitch] = await db
      .update(artPitches)
      .set({ status: 'rejected', admin_note: admin_note ?? null, reviewed_at: new Date() })
      .where(eq(artPitches.id, id))
      .returning();
    res.json(pitch);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/art-admin/pitches/:id/payout — Stripe transfer to artist
router.post('/pitches/:id/payout', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [pitch] = await db
      .select({ id: artPitches.id, status: artPitches.status, grant_amount_cents: artPitches.grant_amount_cents, stripe_transfer_id: artPitches.stripe_transfer_id, user_id: artPitches.user_id })
      .from(artPitches)
      .where(eq(artPitches.id, id))
      .limit(1);

    if (!pitch || pitch.status !== 'approved') {
      res.status(400).json({ error: 'pitch_not_approved' });
      return;
    }
    if (pitch.stripe_transfer_id) {
      res.status(409).json({ error: 'already_paid_out', transfer_id: pitch.stripe_transfer_id });
      return;
    }
    if (!pitch.grant_amount_cents) {
      res.status(400).json({ error: 'no_grant_amount' });
      return;
    }

    const [artist] = await db.select({ stripe_connect_account_id: users.stripe_connect_account_id }).from(users).where(eq(users.id, pitch.user_id)).limit(1);
    if (!artist?.stripe_connect_account_id) {
      res.status(400).json({ error: 'artist_no_stripe_connect' });
      return;
    }

    const transfer = await stripe.transfers.create({
      amount: pitch.grant_amount_cents,
      currency: 'cad',
      destination: artist.stripe_connect_account_id,
      metadata: { type: 'art_grant', pitch_id: String(id) },
    });

    await db.update(artPitches).set({ stripe_transfer_id: transfer.id }).where(eq(artPitches.id, id));
    res.json({ transfer_id: transfer.id });
  } catch (e) {
    logger.error('art payout error', e);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/art-admin/artworks — all uploaded artworks
router.get('/artworks', requirePin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: artworks.id,
        title: artworks.title,
        media_url: artworks.media_url,
        description: artworks.description,
        status: artworks.status,
        created_at: artworks.created_at,
        artist_name: users.display_name,
        pitch_title: artPitches.title,
      })
      .from(artworks)
      .leftJoin(users, eq(artworks.user_id, users.id))
      .leftJoin(artPitches, eq(artworks.pitch_id, artPitches.id))
      .orderBy(desc(artworks.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/art-admin/artworks/:id/acquire — Maison acquires piece
router.post('/artworks/:id/acquire', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { acquisition_price_cents, management_fee_annual_cents, nfc_token_serial } = req.body;

  if (isNaN(id) || !acquisition_price_cents || !management_fee_annual_cents) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const [acquisition] = await db
      .insert(artAcquisitions)
      .values({ artwork_id: id, acquisition_price_cents, management_fee_annual_cents, nfc_token_serial: nfc_token_serial ?? null })
      .returning();

    await db.update(artworks).set({ status: 'acquired' }).where(eq(artworks.id, id));
    res.status(201).json(acquisition);
  } catch (e: any) {
    if (e?.code === '23505') { res.status(409).json({ error: 'already_acquired' }); return; }
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/art-admin/artworks/:id/auction — create timed auction
router.post('/artworks/:id/auction', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { reserve_price_cents, starts_at, ends_at } = req.body;

  if (isNaN(id) || !reserve_price_cents || !starts_at || !ends_at) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const [artwork] = await db.select({ status: artworks.status }).from(artworks).where(eq(artworks.id, id)).limit(1);
    if (!artwork || artwork.status === 'acquired') {
      res.status(400).json({ error: 'artwork_not_eligible' });
      return;
    }

    const [auction] = await db
      .insert(artAuctions)
      .values({ artwork_id: id, reserve_price_cents, starts_at: new Date(starts_at), ends_at: new Date(ends_at) })
      .returning();

    await db.update(artworks).set({ status: 'auctioned' }).where(eq(artworks.id, id));
    res.status(201).json(auction);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// GET /api/art-admin/auctions — all auctions with top bid
router.get('/auctions', requirePin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: artAuctions.id,
        artwork_id: artAuctions.artwork_id,
        artwork_title: artworks.title,
        artist_name: users.display_name,
        reserve_price_cents: artAuctions.reserve_price_cents,
        starts_at: artAuctions.starts_at,
        ends_at: artAuctions.ends_at,
        status: artAuctions.status,
        winning_bid_id: artAuctions.winning_bid_id,
      })
      .from(artAuctions)
      .leftJoin(artworks, eq(artAuctions.artwork_id, artworks.id))
      .leftJoin(users, eq(artworks.user_id, users.id))
      .orderBy(desc(artAuctions.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// POST /api/art-admin/auctions/:id/settle — settle ended auction
// Body: { management_fee_annual_cents: number, nfc_token_serial?: string }
// Creates a Stripe PaymentIntent for the winning bid amount and charges the collector.
router.post('/auctions/:id/settle', requirePin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  const { management_fee_annual_cents, nfc_token_serial } = req.body;
  if (!management_fee_annual_cents || typeof management_fee_annual_cents !== 'number') {
    res.status(400).json({ error: 'management_fee_annual_cents required' });
    return;
  }

  try {
    const [auction] = await db.select().from(artAuctions).where(eq(artAuctions.id, id)).limit(1);
    if (!auction) { res.status(404).json({ error: 'not_found' }); return; }
    if (auction.status !== 'active') { res.status(400).json({ error: 'already_settled' }); return; }

    // Find highest bid
    const [topBid] = await db
      .select()
      .from(artBids)
      .where(eq(artBids.auction_id, id))
      .orderBy(desc(artBids.amount_cents))
      .limit(1);

    if (!topBid || topBid.amount_cents < auction.reserve_price_cents) {
      await db.update(artAuctions).set({ status: 'ended' }).where(eq(artAuctions.id, id));
      res.json({ settled: false, reason: 'reserve_not_met' });
      return;
    }

    // Charge the winner via Stripe — admin collects payment off-platform or via
    // a separate payment link; store the resulting PaymentIntent ID here.
    // For now we create a PaymentIntent to be confirmed by the collector separately.
    const [winner] = await db
      .select({ stripe_connect_account_id: users.stripe_connect_account_id })
      .from(users)
      .where(eq(users.id, topBid.user_id))
      .limit(1);

    const pi = await stripe.paymentIntents.create({
      amount: topBid.amount_cents,
      currency: 'cad',
      metadata: { type: 'art_auction_win', auction_id: String(id), bid_id: String(topBid.id) },
    });

    await db.update(artBids).set({ stripe_payment_intent_id: pi.id }).where(eq(artBids.id, topBid.id));
    await db.update(artAuctions).set({ status: 'ended', winning_bid_id: topBid.id }).where(eq(artAuctions.id, id));

    // Maison holds the work on the collector's behalf — create acquisition record
    const [acquisition] = await db
      .insert(artAcquisitions)
      .values({
        artwork_id: auction.artwork_id,
        acquisition_price_cents: topBid.amount_cents,
        management_fee_annual_cents,
        nfc_token_serial: nfc_token_serial ?? null,
      })
      .returning();

    await db.update(artworks).set({ status: 'acquired' }).where(eq(artworks.id, auction.artwork_id));

    // Schedule first annual management fee
    const dueAt = new Date();
    dueAt.setFullYear(dueAt.getFullYear() + 1);
    await db.insert(artManagementFees).values({
      acquisition_id: acquisition.id,
      collector_user_id: topBid.user_id,
      amount_cents: management_fee_annual_cents,
      due_at: dueAt,
    });

    res.json({ settled: true, winning_bid: topBid, acquisition, payment_intent_client_secret: pi.client_secret });
  } catch (e) {
    logger.error('auction settle error', e);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
