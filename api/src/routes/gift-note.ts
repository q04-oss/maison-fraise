import { Router, Request, Response } from 'express';
import { requireUser } from '../lib/auth';

const router = Router();

// POST /api/gift-note
router.post('/', requireUser, async (req: Request, res: Response) => {
  const { tone, variety_name, recipient_context } = req.body;
  if (!tone || !variety_name || !recipient_context) {
    res.status(400).json({ error: 'tone, variety_name, and recipient_context are required' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: 'You write short handwritten gift notes for Maison Fraise, a premium chocolate-covered strawberry brand. Notes are warm, restrained, and French-patisserie in tone. Never more than 2 sentences. Never mention the brand name in the note.',
        messages: [{ role: 'user', content: `Write a ${tone} gift note. The strawberry is ${variety_name}. Context about the recipient: ${recipient_context}` }],
      }),
    });

    const data = await response.json() as { content: { text: string }[] };
    res.json({ note: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
