import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from './logger';

export async function fireWebhook(userId: number, event: string, payload: object): Promise<void> {
  try {
    const rows = await db.execute(sql`
      SELECT id, url, secret FROM webhook_subscriptions
      WHERE user_id = ${userId} AND active = true AND ${event} = ANY(events)
    `);
    const subs = (rows as any).rows ?? rows;
    for (const sub of subs) {
      const body = JSON.stringify({ event, data: payload, fired_at: new Date().toISOString() });
      const sig = 'sha256=' + crypto.createHmac('sha256', sub.secret).update(body).digest('hex');
      fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fraise-Event': event,
          'X-Fraise-Signature': sig,
        },
        body,
      }).then(r => {
        db.execute(sql`
          UPDATE webhook_subscriptions SET last_fired_at=now(), last_status_code=${r.status}
          WHERE id=${sub.id}
        `).catch(() => {});
      }).catch((err) => {
        logger.error('Webhook delivery failed', { url: sub.url, err });
      });
    }
  } catch (err) {
    logger.error('fireWebhook error', err);
  }
}
