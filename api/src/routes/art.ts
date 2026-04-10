import { Router, Request, Response } from 'express';
import { eq, desc, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { artPitches, artworks, artAcquisitions, artAuctions, artBids, users } from '../db/schema';
import { requireUser } from '../lib/auth';
import { logger } from '../lib/logger';

const router = Router();

// ─── User: submit a pitch ─────────────────────────────────────────────────────

router.post('/pitch', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { title, abstract, reference_image_url } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 120) {
    res.status(400).json({ error: 'invalid_title', message: 'Title must be 3–120 characters.' });
    return;
  }
  if (!abstract || typeof abstract !== 'string' || abstract.trim().length < 50 || abstract.trim().length > 1000) {
    res.status(400).json({ error: 'invalid_abstract', message: 'Abstract must be 50–1000 characters.' });
    return;
  }

  try {
    // One pending pitch at a time
    const [pending] = await db
      .select({ id: artPitches.id })
      .from(artPitches)
      .where(and(eq(artPitches.user_id, userId), eq(artPitches.status, 'submitted')))
      .limit(1);

    if (pending) {
      res.status(409).json({ error: 'pitch_pending', message: 'You already have a pitch under consideration.' });
      return;
    }

    const [pitch] = await db
      .insert(artPitches)
      .values({
        user_id: userId,
        title: title.trim(),
        abstract: abstract.trim(),
        reference_image_url: reference_image_url ?? null,
      })
      .returning();

    res.status(201).json(pitch);
  } catch (e) {
    logger.error('art pitch error', e);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── User: my pitches ─────────────────────────────────────────────────────────

router.get('/pitches/mine', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const rows = await db
      .select()
      .from(artPitches)
      .where(eq(artPitches.user_id, userId))
      .orderBy(desc(artPitches.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── User: upload finished artwork (after pitch approved) ─────────────────────

router.post('/artwork', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const { pitch_id, title, media_url, description } = req.body;

  if (!pitch_id || !title || !media_url) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const [pitch] = await db
      .select()
      .from(artPitches)
      .where(and(eq(artPitches.id, pitch_id), eq(artPitches.user_id, userId), eq(artPitches.status, 'approved')))
      .limit(1);

    if (!pitch) {
      res.status(403).json({ error: 'pitch_not_approved' });
      return;
    }

    const [artwork] = await db
      .insert(artworks)
      .values({
        pitch_id,
        user_id: userId,
        title: title.trim(),
        media_url,
        description: description?.trim() ?? null,
      })
      .returning();

    res.status(201).json(artwork);
  } catch (e) {
    logger.error('artwork upload error', e);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Public: gallery ──────────────────────────────────────────────────────────

router.get('/gallery', async (_req: Request, res: Response) => {
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
        artist_id: artworks.user_id,
        pitch_abstract: artPitches.abstract,
      })
      .from(artworks)
      .leftJoin(artPitches, eq(artworks.pitch_id, artPitches.id))
      .leftJoin(users, eq(artworks.user_id, users.id))
      .orderBy(desc(artworks.created_at));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Public: active auctions ──────────────────────────────────────────────────

router.get('/auctions', async (_req: Request, res: Response) => {
  const now = new Date();
  try {
    const rows = await db
      .select({
        id: artAuctions.id,
        artwork_id: artAuctions.artwork_id,
        artwork_title: artworks.title,
        artwork_media_url: artworks.media_url,
        artist_name: users.display_name,
        reserve_price_cents: artAuctions.reserve_price_cents,
        starts_at: artAuctions.starts_at,
        ends_at: artAuctions.ends_at,
        status: artAuctions.status,
      })
      .from(artAuctions)
      .leftJoin(artworks, eq(artAuctions.artwork_id, artworks.id))
      .leftJoin(users, eq(artworks.user_id, users.id))
      .where(and(eq(artAuctions.status, 'active'), gt(artAuctions.ends_at, now)))
      .orderBy(artAuctions.ends_at);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Public: auction detail + bids ────────────────────────────────────────────

router.get('/auctions/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid_id' }); return; }

  try {
    const [auction] = await db
      .select({
        id: artAuctions.id,
        artwork_id: artAuctions.artwork_id,
        artwork_title: artworks.title,
        artwork_media_url: artworks.media_url,
        artwork_description: artworks.description,
        artist_name: users.display_name,
        pitch_abstract: artPitches.abstract,
        reserve_price_cents: artAuctions.reserve_price_cents,
        starts_at: artAuctions.starts_at,
        ends_at: artAuctions.ends_at,
        status: artAuctions.status,
        winning_bid_id: artAuctions.winning_bid_id,
      })
      .from(artAuctions)
      .leftJoin(artworks, eq(artAuctions.artwork_id, artworks.id))
      .leftJoin(users, eq(artworks.user_id, users.id))
      .leftJoin(artPitches, eq(artworks.pitch_id, artPitches.id))
      .where(eq(artAuctions.id, id))
      .limit(1);

    if (!auction) { res.status(404).json({ error: 'not_found' }); return; }

    const bids = await db
      .select({
        id: artBids.id,
        amount_cents: artBids.amount_cents,
        created_at: artBids.created_at,
        bidder_name: users.display_name,
      })
      .from(artBids)
      .leftJoin(users, eq(artBids.user_id, users.id))
      .where(eq(artBids.auction_id, id))
      .orderBy(desc(artBids.amount_cents));

    res.json({ ...auction, bids });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── User: place a bid ────────────────────────────────────────────────────────

router.post('/auctions/:id/bid', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  const auctionId = parseInt(req.params.id, 10);
  const { amount_cents } = req.body;

  if (isNaN(auctionId) || !amount_cents || typeof amount_cents !== 'number' || amount_cents < 100) {
    res.status(400).json({ error: 'invalid_bid' });
    return;
  }

  const now = new Date();

  try {
    const [auction] = await db
      .select()
      .from(artAuctions)
      .where(and(eq(artAuctions.id, auctionId), eq(artAuctions.status, 'active'), gt(artAuctions.ends_at, now)))
      .limit(1);

    if (!auction) {
      res.status(404).json({ error: 'auction_not_found_or_ended' });
      return;
    }

    if (amount_cents < auction.reserve_price_cents) {
      res.status(400).json({ error: 'below_reserve', reserve_price_cents: auction.reserve_price_cents });
      return;
    }

    // Must beat current highest bid
    const [topBid] = await db
      .select({ amount_cents: artBids.amount_cents })
      .from(artBids)
      .where(eq(artBids.auction_id, auctionId))
      .orderBy(desc(artBids.amount_cents))
      .limit(1);

    if (topBid && amount_cents <= topBid.amount_cents) {
      res.status(400).json({ error: 'bid_too_low', current_high_cents: topBid.amount_cents });
      return;
    }

    // Record the bid — payment is collected at settlement when this bid wins
    const [bid] = await db
      .insert(artBids)
      .values({
        auction_id: auctionId,
        user_id: userId,
        amount_cents,
      })
      .returning();

    res.status(201).json({ bid });
  } catch (e) {
    logger.error('art bid error', e);
    res.status(500).json({ error: 'internal' });
  }
});

// ─── Public: NFC provenance lookup ───────────────────────────────────────────

router.get('/provenance/:serial', async (req: Request, res: Response) => {
  const { serial } = req.params;
  try {
    const [acquisition] = await db
      .select({
        id: artAcquisitions.id,
        acquired_at: artAcquisitions.acquired_at,
        acquisition_price_cents: artAcquisitions.acquisition_price_cents,
        management_fee_annual_cents: artAcquisitions.management_fee_annual_cents,
        artwork_id: artAcquisitions.artwork_id,
        artwork_title: artworks.title,
        artwork_media_url: artworks.media_url,
        artwork_description: artworks.description,
        artist_name: users.display_name,
        pitch_abstract: artPitches.abstract,
        grant_amount_cents: artPitches.grant_amount_cents,
      })
      .from(artAcquisitions)
      .leftJoin(artworks, eq(artAcquisitions.artwork_id, artworks.id))
      .leftJoin(users, eq(artworks.user_id, users.id))
      .leftJoin(artPitches, eq(artworks.pitch_id, artPitches.id))
      .where(eq(artAcquisitions.nfc_token_serial, serial))
      .limit(1);

    if (!acquisition) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(acquisition);
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

// ─── User: my art contributions (for profile social signal) ──────────────────

router.get('/my-contributions', requireUser, async (req: Request, res: Response) => {
  const userId: number = (req as any).userId;
  try {
    const painted = await db
      .select({
        artwork_id: artworks.id,
        title: artworks.title,
        media_url: artworks.media_url,
        status: artworks.status,
        created_at: artworks.created_at,
      })
      .from(artworks)
      .where(eq(artworks.user_id, userId))
      .orderBy(desc(artworks.created_at));

    const wonBids = await db
      .select({
        artwork_id: artworks.id,
        title: artworks.title,
        media_url: artworks.media_url,
        amount_cents: artBids.amount_cents,
        created_at: artBids.created_at,
      })
      .from(artBids)
      .leftJoin(artAuctions, eq(artBids.auction_id, artAuctions.id))
      .leftJoin(artworks, eq(artAuctions.artwork_id, artworks.id))
      .where(and(eq(artBids.user_id, userId), eq(artAuctions.winning_bid_id, artBids.id)))
      .orderBy(desc(artBids.created_at));

    res.json({
      painted: painted.map(p => ({ ...p, role: 'artist' as const })),
      collected: wonBids.map(b => ({ ...b, role: 'collector' as const })),
    });
  } catch (e) {
    logger.error('my-contributions error', e);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
