import { Router, Request, Response } from 'express';
import { eq, sum } from 'drizzle-orm';
import { db } from '../db';
import { legitimacyEvents, users } from '../db/schema';

const router = Router();

function requirePosPin(req: Request, res: Response): boolean {
  const pin = req.headers['x-pos-pin'];
  if (!pin || pin !== process.env.CHOCOLATIER_PIN) {
    res.status(401).json({ error: 'Invalid or missing X-POS-PIN header' });
    return false;
  }
  return true;
}

// POST /api/pos/transaction
router.post('/transaction', async (req: Request, res: Response) => {
  if (!requirePosPin(req, res)) return;

  const { user_id, business_id, amount_cents, payment_method } = req.body;

  if (!user_id || !business_id || !amount_cents || !payment_method) {
    res.status(400).json({ error: 'user_id, business_id, amount_cents, and payment_method are required' });
    return;
  }

  if (payment_method !== 'cash' && payment_method !== 'card') {
    res.status(400).json({ error: 'payment_method must be cash or card' });
    return;
  }

  try {
    const event_type = payment_method === 'cash' ? 'cash_transaction' : 'card_transaction';
    const weight = payment_method === 'cash' ? 3 : 2;

    await db.insert(legitimacyEvents).values({
      user_id,
      event_type,
      weight,
      business_id,
    });

    const [scoreRow] = await db
      .select({ total: sum(legitimacyEvents.weight) })
      .from(legitimacyEvents)
      .where(eq(legitimacyEvents.user_id, user_id));

    const legitimacy_score = Number(scoreRow?.total ?? 0);

    res.json({ logged: true, payment_method, amount_cents, legitimacy_score });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
