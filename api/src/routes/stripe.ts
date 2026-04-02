import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { stripe } from '../lib/stripe';
import { db } from '../db';
import { orders, varieties, timeSlots, popupRsvps, popupRequests, campaignCommissions, users, businesses } from '../db/schema';
import { sendPushNotification } from '../lib/push';
import { sendRsvpConfirmed, sendOrderConfirmation, sendTipReceived } from '../lib/resend';
import { logger } from '../lib/logger';

const router = Router();

// POST /api/stripe/webhook
// Note: this route receives a raw Buffer body (configured in app.ts)
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', err);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const type = pi.metadata?.type;

      // New order flow — PI created by POST /api/orders/payment-intent (no pre-created order row)
      if (!type && pi.metadata?.variety_id && pi.metadata?.customer_email) {
        // Idempotency check — skip if order already created for this payment intent
        const existing = await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.payment_intent_id, pi.id))
          .limit(1);
        if (existing.length > 0) {
          logger.info('Duplicate webhook, skipping');
          res.json({ received: true });
          return;
        }

        const variety_id = parseInt(pi.metadata.variety_id, 10);
        const quantity = parseInt(pi.metadata.quantity, 10);
        const location_id = parseInt(pi.metadata.location_id, 10);
        const time_slot_id = parseInt(pi.metadata.time_slot_id, 10);
        const chocolate = pi.metadata.chocolate as 'guanaja_70' | 'caraibe_66' | 'jivara_40' | 'ivoire_blanc';
        const finish = pi.metadata.finish as 'plain' | 'fleur_de_sel' | 'or_fin';
        const is_gift = pi.metadata.is_gift === 'true';
        const gift_note = pi.metadata.gift_note || null;
        const customer_email = pi.metadata.customer_email;

        // Decrement stock
        await db
          .update(varieties)
          .set({ stock_remaining: sql`stock_remaining - ${quantity}` })
          .where(eq(varieties.id, variety_id));

        // Generate NFC token
        const nfc_token = crypto.randomBytes(4).toString('hex');

        // Insert order
        const [newOrder] = await db
          .insert(orders)
          .values({
            variety_id,
            location_id,
            time_slot_id,
            chocolate,
            finish,
            quantity,
            is_gift,
            total_cents: pi.amount,
            stripe_payment_intent_id: pi.id,
            payment_intent_id: pi.id,
            status: 'paid',
            customer_email,
            gift_note,
            nfc_token,
          })
          .returning();

        logger.info(`Order ${newOrder.id} created + paid via payment_intent webhook`);

        // Send confirmation email (fire-and-forget)
        Promise.all([
          db.select().from(varieties).where(eq(varieties.id, variety_id)),
          db.select().from(timeSlots).where(eq(timeSlots.id, time_slot_id)),
        ]).then(([[variety], [slot]]) => {
          if (variety && slot) {
            sendOrderConfirmation({
              to: customer_email,
              varietyName: variety.name,
              chocolate,
              finish,
              quantity,
              isGift: is_gift,
              totalCents: pi.amount,
              slotDate: slot.date,
              slotTime: slot.time,
            }).catch(() => {});
          }
        }).catch(() => {});

        // Gift recipient push notification (fire-and-forget)
        if (is_gift && pi.metadata.gift_recipient_id) {
          const gift_recipient_id = parseInt(pi.metadata.gift_recipient_id, 10);
          if (!isNaN(gift_recipient_id)) {
            db.select({ push_token: users.push_token })
              .from(users)
              .where(eq(users.id, gift_recipient_id))
              .then(([recipient]) => {
                if (recipient?.push_token) {
                  sendPushNotification(recipient.push_token, {
                    title: 'You have a gift order from Maison Fraise 🍓',
                    body: gift_note ?? 'Someone sent you a gift.',
                    data: { order_id: newOrder.id },
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }

      } else if (!type || type === 'order') {
        // Legacy order flow
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.stripe_payment_intent_id, pi.id));
        if (order && order.status === 'pending') {
          await db.update(orders).set({ status: 'paid' }).where(eq(orders.id, order.id));
          logger.info(`Order ${order.id} marked paid via webhook`);
        }
      } else if (type === 'popup_rsvp') {
        const [rsvp] = await db
          .select()
          .from(popupRsvps)
          .where(eq(popupRsvps.stripe_payment_intent_id, pi.id));
        if (rsvp && rsvp.status === 'pending') {
          await db.update(popupRsvps).set({ status: 'paid' }).where(eq(popupRsvps.id, rsvp.id));
          logger.info(`Popup RSVP ${rsvp.id} marked paid via webhook`);

          // Send RSVP confirmation email (fire-and-forget)
          const user_id = rsvp.user_id;
          const popup_id = rsvp.popup_id;
          Promise.all([
            db.select({ email: users.email }).from(users).where(eq(users.id, user_id)),
            db.select({ name: businesses.name, starts_at: businesses.starts_at }).from(businesses).where(eq(businesses.id, popup_id)),
          ]).then(([[user], [popup]]) => {
            if (user?.email && popup) {
              const popupDateStr = popup.starts_at
                ? new Date(popup.starts_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
                : null;
              sendRsvpConfirmed({
                to: user.email,
                popupName: popup.name,
                popupDate: popupDateStr,
                feeCents: pi.amount,
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      } else if (type === 'popup_request') {
        const [request] = await db
          .select()
          .from(popupRequests)
          .where(eq(popupRequests.stripe_payment_intent_id, pi.id));
        if (request && request.status === 'pending') {
          await db.update(popupRequests).set({ status: 'paid' }).where(eq(popupRequests.id, request.id));
          logger.info(`Popup request ${request.id} marked paid via webhook`);
        }
      } else if (type === 'campaign_commission') {
        const [commission] = await db
          .select()
          .from(campaignCommissions)
          .where(eq(campaignCommissions.stripe_payment_intent_id, pi.id));
        if (commission && commission.status === 'pending') {
          await db.update(campaignCommissions).set({ status: 'paid' }).where(eq(campaignCommissions.id, commission.id));
          logger.info(`Campaign commission ${commission.id} marked paid via webhook`);
        }
      } else if (type === 'tip') {
        const contracted_user_id = parseInt(pi.metadata?.contracted_user_id ?? '', 10);
        const amount = pi.amount;
        if (!isNaN(contracted_user_id)) {
          const [tipUser] = await db.select({ push_token: users.push_token, email: users.email })
            .from(users).where(eq(users.id, contracted_user_id));
          if (tipUser?.push_token) {
            sendPushNotification(tipUser.push_token, {
              title: 'You received a tip',
              body: `CA$${(amount / 100).toFixed(2)} — thank you!`,
              data: { screen: 'home' },
            }).catch(() => {});
          }
          if (tipUser?.email) {
            sendTipReceived({
              to: tipUser.email,
              amount_cents: amount,
              popup_name: pi.metadata?.popup_name ?? 'a popup',
              tipper_name: pi.metadata?.tipper_name,
            }).catch(() => {});
          }
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const type = pi.metadata?.type;

      if (!type || type === 'order') {
        await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.stripe_payment_intent_id, pi.id));
      } else if (type === 'popup_rsvp') {
        await db.update(popupRsvps).set({ status: 'cancelled' }).where(eq(popupRsvps.stripe_payment_intent_id, pi.id));
      } else if (type === 'popup_request') {
        await db.update(popupRequests).set({ status: 'cancelled' }).where(eq(popupRequests.stripe_payment_intent_id, pi.id));
      } else if (type === 'campaign_commission') {
        await db.update(campaignCommissions).set({ status: 'cancelled' }).where(eq(campaignCommissions.stripe_payment_intent_id, pi.id));
      }
    }
  } catch (err) {
    // Log but return 200 — Stripe will retry on non-2xx responses
    logger.error('Webhook handler error', err);
  }

  res.json({ received: true });
});

export default router;
