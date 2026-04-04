import { Router, Request, Response } from 'express';
import { eq, inArray, sql, and } from 'drizzle-orm';
import { db } from '../db';
import { campaigns, campaignSignups, users, legitimacyEvents } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// GET /api/campaigns
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(campaigns)
      .where(inArray(campaigns.status, ['upcoming', 'open', 'waitlist']));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/campaigns/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/campaigns/:id/signup
router.post('/:id/signup', requireUser, async (req: Request, res: Response) => {
  const campaign_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;

  if (isNaN(campaign_id)) {
    res.status(400).json({ error: 'Invalid campaign id' });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, user_id));
    if (!user || !user.verified) {
      res.status(403).json({ error: 'Campaigns are available to verified members only. Tap your box to get verified.' });
      return;
    }

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaign_id));
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const [existing] = await db.select({ id: campaignSignups.id }).from(campaignSignups)
      .where(and(eq(campaignSignups.campaign_id, campaign_id), eq(campaignSignups.user_id, user_id)));
    if (existing) {
      res.status(409).json({ error: 'already_signed_up' });
      return;
    }

    const signup = await db.transaction(async (tx) => {
      // Re-read campaign inside transaction and lock the row
      const [fresh] = await tx.execute<{ spots_remaining: number; status: string }>(
        sql`SELECT spots_remaining, status FROM campaigns WHERE id = ${campaign_id} FOR UPDATE`
      ).then((r: any) => (r.rows ?? r) as { spots_remaining: number; status: string }[]);

      const onWaitlist = !fresh || fresh.spots_remaining <= 0 || fresh.status === 'waitlist';

      const [row] = await tx.insert(campaignSignups).values({
        campaign_id,
        user_id,
        waitlist: onWaitlist,
        status: onWaitlist ? 'waitlist' : 'confirmed',
      }).returning();

      if (!onWaitlist) {
        await tx.update(campaigns)
          .set({ spots_remaining: sql`${campaigns.spots_remaining} - 1` })
          .where(and(eq(campaigns.id, campaign_id), sql`${campaigns.spots_remaining} > 0`));
      }

      await tx.insert(legitimacyEvents).values({
        user_id,
        event_type: 'campaign_signup',
        weight: 2,
      });

      return row;
    });

    res.status(201).json(signup);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/campaigns/:id/signup
router.delete('/:id/signup', requireUser, async (req: Request, res: Response) => {
  const campaign_id = parseInt(req.params.id, 10);
  const user_id: number = (req as any).userId;

  if (isNaN(campaign_id)) {
    res.status(400).json({ error: 'Invalid campaign id' });
    return;
  }

  try {
    const [signup] = await db.select().from(campaignSignups)
      .where(and(eq(campaignSignups.campaign_id, campaign_id), eq(campaignSignups.user_id, user_id)));

    if (!signup) {
      res.status(404).json({ error: 'Signup not found' });
      return;
    }

    const cancelled = await db.update(campaignSignups)
      .set({ status: 'cancelled' })
      .where(and(eq(campaignSignups.id, signup.id), sql`${campaignSignups.status} != 'cancelled'`))
      .returning({ id: campaignSignups.id });

    if (cancelled.length === 0) {
      res.status(409).json({ error: 'Signup already cancelled' });
      return;
    }

    if (!signup.waitlist) {
      await db.update(campaigns)
        .set({ spots_remaining: sql`${campaigns.spots_remaining} + 1` })
        .where(eq(campaigns.id, campaign_id));
    }

    res.json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
