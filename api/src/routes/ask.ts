import { Router } from 'express';
import { db } from '../db';
import { varieties, businesses, orders } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireUser } from '../lib/auth';

const router = Router();

router.post('/', requireUser, async (req, res) => {
  const { query, user_id, context } = req.body;

  if (!query) return res.status(400).json({ error: 'query required' });

  const available = context?.available_varieties ?? [];
  const bizList = context?.businesses ?? [];
  const history = context?.user_order_history ?? [];

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        system: `You are the intelligence inside Box Fraise, a premium chocolate-covered strawberry platform. You know everything about the network — the varieties available today, their farms, their freshness, the businesses on the platform, and this user's order history. You respond in one to three short sentences maximum. You are precise, warm, and never verbose. When you recommend something you state it clearly and directly. When the network has businesses relevant to the query you mention them naturally. You never mention that you are an AI. You never use the word 'delicious'. You always respond in the same language the user writes in.

Available today: ${JSON.stringify(available)}
Businesses on the network: ${JSON.stringify(bizList)}
User order history: ${JSON.stringify(history)}`,
        messages: [{ role: 'user', content: query }],
      }),
    });

    if (!apiRes.ok) throw new Error('Claude API error');
    const data = await apiRes.json() as any;
    const response = data.content?.[0]?.text ?? '';

    // Determine action: look for variety mention in response
    let action: {
      type: string | null;
      variety_id: number | null;
      chocolate: string | null;
      finish: string | null;
      quantity: number | null;
      location_id: number | null;
      business_id: number | null;
    } = { type: null, variety_id: null, chocolate: null, finish: null, quantity: null, location_id: null, business_id: null };

    if (available.length > 0) {
      const matched = available.find((v: any) =>
        response.toLowerCase().includes(v.name?.toLowerCase())
      );
      if (matched) {
        action = {
          type: 'order',
          variety_id: matched.id,
          chocolate: 'guanaja_70',
          finish: 'plain',
          quantity: 1,
          location_id: null,
          business_id: null,
        };
      }
    }

    res.json({ response, action });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
