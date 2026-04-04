import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { eq, sql, and } from 'drizzle-orm';
import crypto from 'crypto';
import { stripe } from '../lib/stripe';
import { db } from '../db';
import { orders, varieties, timeSlots, popupRsvps, popupRequests, campaignCommissions, users, businesses, memberships, membershipFunds, fundContributions, portalAccess, tokens, seasonPatronages, patronTokens, greenhouses, greenhouseFunding, provenanceTokens, locationFunding, messages } from '../db/schema';
import { sendPushNotification } from '../lib/push';
import { sendRsvpConfirmed, sendOrderConfirmation, sendTipReceived } from '../lib/resend';
import { logger } from '../lib/logger';
import { TIER_LABELS } from '../lib/membership';
import { calculateCut } from '../lib/portal';
import { computeTokenVisuals, getNextTokenNumber } from '../lib/tokenAlgorithm';
import { checkAndTriggerAutoOrder } from '../lib/autoOrder';

const router = Router();

// POST /api/stripe/webhook
// Note: this route receives a raw Buffer body (configured in app.ts)
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not set — rejecting webhook');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
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

        const VALID_CHOCOLATES = ['guanaja_70', 'caraibe_66', 'jivara_40', 'ivoire_blanc'] as const;
        const VALID_FINISHES = ['plain', 'fleur_de_sel', 'or_fin'] as const;
        const chocolate = pi.metadata.chocolate as typeof VALID_CHOCOLATES[number];
        const finish = pi.metadata.finish as typeof VALID_FINISHES[number];

        if (
          isNaN(variety_id) || isNaN(quantity) || isNaN(location_id) || isNaN(time_slot_id) ||
          quantity < 1 || quantity > 100 ||
          !VALID_CHOCOLATES.includes(chocolate) ||
          !VALID_FINISHES.includes(finish)
        ) {
          logger.error('Webhook metadata invalid', pi.metadata);
          res.status(400).json({ received: false, error: 'invalid_metadata' });
          return;
        }

        const is_gift = pi.metadata.is_gift === 'true';
        const gift_note = pi.metadata.gift_note || null;
        const customer_email = pi.metadata.customer_email;
        const discount_applied = pi.metadata.discount_applied === 'true';

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
            discount_applied,
          })
          .returning();

        logger.info(`Order ${newOrder.id} created + paid via payment_intent webhook`);

        // Post order confirmation message from shop to customer (fire-and-forget)
        Promise.all([
          db.select({ id: users.id }).from(users).where(eq(users.email, customer_email)).limit(1),
          db.select({ id: users.id }).from(users).where(and(eq(users.is_shop, true), eq(users.business_id, location_id))).limit(1),
          db.select({ name: varieties.name }).from(varieties).where(eq(varieties.id, variety_id)).limit(1),
          db.select({ time: timeSlots.time }).from(timeSlots).where(eq(timeSlots.id, time_slot_id)).limit(1),
        ]).then(([[customerUser], [shopUser], [variety], [slot]]) => {
          if (customerUser && shopUser && variety && slot) {
            const body = `order confirmed — ${variety.name} · ${quantity > 1 ? `${quantity} boxes` : '1 box'} · pickup ${slot.time}`;
            db.insert(messages).values({ sender_id: shopUser.id, recipient_id: customerUser.id, body }).catch(() => {});
          }
        }).catch(() => {});

        // Mint token if excess_amount_cents > 0
        const metadata = pi.metadata;
        const excessCents = parseInt(metadata.excess_amount_cents ?? '0', 10);
        if (!isNaN(excessCents) && excessCents > 0) {
          try {
            // Resolve user_id from customer_email
            const [orderUser] = await db
              .select({ id: users.id, push_token: users.push_token })
              .from(users)
              .where(eq(users.email, customer_email));

            if (orderUser) {
              // Fetch variety (including variety_type) and location names for denormalization
              const [variety] = await db
                .select({ name: varieties.name, variety_type: varieties.variety_type })
                .from(varieties)
                .where(eq(varieties.id, variety_id));
              const [location] = await db
                .select({ name: timeSlots.time })
                .from(timeSlots)
                .where(eq(timeSlots.id, time_slot_id));

              // Fetch business info for chocolate token enrichment
              const [orderBusiness] = await db
                .select({
                  partner_name: businesses.partner_name,
                  location_type: businesses.location_type,
                })
                .from(businesses)
                .where(eq(businesses.id, location_id));

              const isChocolate = variety?.variety_type === 'chocolate';

              const visuals = computeTokenVisuals(excessCents);
              const tokenNumber = await getNextTokenNumber(variety_id, db, tokens, eq);

              const [mintedToken] = await db
                .insert(tokens)
                .values({
                  token_number: tokenNumber,
                  variety_id: newOrder.variety_id,
                  order_id: newOrder.id,
                  original_owner_id: orderUser.id,
                  current_owner_id: orderUser.id,
                  excess_amount_cents: excessCents,
                  visual_size: visuals.size,
                  visual_color: visuals.color,
                  visual_seeds: visuals.seeds,
                  visual_irregularity: visuals.irregularity,
                  nfc_token: nfc_token,
                  variety_name: variety?.name ?? '',
                  location_name: location?.name ?? '',
                  token_type: isChocolate ? 'chocolate' : 'standard',
                  partner_name: isChocolate ? (orderBusiness?.partner_name ?? null) : null,
                  location_type: isChocolate ? (orderBusiness?.location_type ?? null) : null,
                })
                .returning();

              await db
                .update(orders)
                .set({ token_id: mintedToken.id })
                .where(eq(orders.id, newOrder.id));

              if (orderUser.push_token) {
                sendPushNotification(orderUser.push_token, {
                  title: `Token #${tokenNumber} minted`,
                  body: `${variety?.name ?? 'Variety'} · CA$${(excessCents / 100).toFixed(2)} excess`,
                  data: { screen: 'tokens', token_id: mintedToken.id },
                }).catch(() => {});
              }

              logger.info(`Token #${tokenNumber} minted for order ${newOrder.id}`);
            }
          } catch (tokenErr) {
            logger.error('Token minting failed', tokenErr);
          }
        }

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
              data: { screen: 'profile' },
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
      } else if (type === 'membership') {
        const { tier, user_id } = pi.metadata;
        const userId = parseInt(user_id, 10);
        const now = new Date();
        const renews = new Date(now);
        renews.setFullYear(renews.getFullYear() + 1);
        await db.update(memberships).set({
          status: 'active',
          started_at: now,
          renews_at: renews,
          stripe_payment_intent_id: pi.id,
        }).where(and(eq(memberships.user_id, userId), eq(memberships.status, 'pending')));
        const [user] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId));
        if (user?.push_token) {
          sendPushNotification(user.push_token, {
            title: 'Welcome to Maison Fraise',
            body: `Your ${TIER_LABELS[tier] ?? tier} membership is now active.`,
            data: { screen: 'membership' },
          }).catch(() => {});
        }
      } else if (type === 'fund_contribution') {
        const toUserId = parseInt(pi.metadata.to_user_id, 10);
        const fromUserId = pi.metadata.from_user_id ? parseInt(pi.metadata.from_user_id, 10) : null;
        const amount = pi.amount;
        const note = pi.metadata.note || null;
        const [existingContribution] = await db
          .select({ id: fundContributions.id })
          .from(fundContributions)
          .where(eq(fundContributions.stripe_payment_intent_id, pi.id))
          .limit(1);
        if (!existingContribution) {
          await db.insert(fundContributions).values({
            from_user_id: fromUserId,
            to_user_id: toUserId,
            amount_cents: amount,
            stripe_payment_intent_id: pi.id,
            note,
          });
          await db.execute(sql`
            INSERT INTO membership_funds (user_id, balance_cents, cycle_start, updated_at)
            VALUES (${toUserId}, ${amount}, NOW(), NOW())
            ON CONFLICT (user_id) DO UPDATE SET balance_cents = membership_funds.balance_cents + ${amount}, updated_at = NOW()
          `);
          const [recipient] = await db.select({ push_token: users.push_token, display_name: users.display_name }).from(users).where(eq(users.id, toUserId));
          if (recipient?.push_token) {
            const fromLabel = fromUserId ? 'Someone' : 'An anonymous member';
            sendPushNotification(recipient.push_token, {
              title: 'Membership contribution',
              body: `${fromLabel} contributed CA$${(amount / 100).toFixed(2)} to your membership fund.`,
              data: { screen: 'membership' },
            }).catch(() => {});
          }
          // Check if fund now covers membership — trigger auto-order if so
          checkAndTriggerAutoOrder(toUserId, db).catch(() => {});
        }
      } else if (type === 'patronage_claim') {
        const patronageId = parseInt(pi.metadata.patronage_id);
        const userId = parseInt(pi.metadata.user_id);
        const years = parseInt(pi.metadata.years);
        const locationName = pi.metadata.location_name;

        // Update patronage: mark claimed
        await db.update(seasonPatronages).set({
          status: 'claimed',
          patron_user_id: userId,
          years_claimed: years,
          platform_cut_cents: Math.round(pi.amount * 0.20),
          stripe_payment_intent_id: pi.id,
          claimed_at: new Date(),
        }).where(eq(seasonPatronages.id, patronageId));

        // Get patronage to find actual season_year
        const [patronage] = await db.select().from(seasonPatronages).where(eq(seasonPatronages.id, patronageId));
        const baseYear = patronage?.season_year ?? new Date().getFullYear();

        // Mint one patron token per year claimed
        for (let i = 0; i < years; i++) {
          await db.insert(patronTokens).values({
            patronage_id: patronageId,
            patron_user_id: userId,
            season_year: baseYear + i,
            location_name: locationName,
          });
        }

        // Push notification
        const [patronUser] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId));
        if (patronUser?.push_token) {
          const endYear = baseYear + years - 1;
          const yearRange = years === 1 ? String(baseYear) : `${baseYear}–${endYear}`;
          sendPushNotification(patronUser.push_token, {
            title: 'Season patronage confirmed',
            body: `${locationName} ${yearRange}. ${years} patron token${years !== 1 ? 's' : ''} minted.`,
            data: { screen: 'patronages' },
          }).catch(() => {});
        }

        logger.info(`Patronage ${patronageId} claimed by user ${userId} for ${years} year(s)`);
      } else if (type === 'portal_access') {
        const buyerId = parseInt(pi.metadata.buyer_id, 10);
        const ownerId = parseInt(pi.metadata.owner_id, 10);
        const source = pi.metadata.source;
        const amount = pi.amount;

        const expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        const { ownerCents, cutCents } = calculateCut(amount);

        await db.insert(portalAccess).values({
          buyer_id: buyerId,
          owner_id: ownerId,
          amount_cents: amount,
          platform_cut_cents: cutCents,
          source,
          stripe_payment_intent_id: pi.id,
          expires_at: expiresAt,
        });

        // Credit owner's membership fund
        await db.execute(sql`
          INSERT INTO membership_funds (user_id, balance_cents, cycle_start, updated_at)
          VALUES (${ownerId}, ${ownerCents}, NOW(), NOW())
          ON CONFLICT (user_id) DO UPDATE SET balance_cents = membership_funds.balance_cents + ${ownerCents}, updated_at = NOW()
        `);

        // Notify owner
        const [portalOwner] = await db
          .select({ push_token: users.push_token })
          .from(users)
          .where(eq(users.id, ownerId));
        if (portalOwner?.push_token) {
          sendPushNotification(portalOwner.push_token, {
            title: 'New portal subscriber',
            body: `New portal subscriber — CA$${(ownerCents / 100).toFixed(2)} added to your fund.`,
            data: { screen: 'membership' },
          }).catch(() => {});
        }
        // Check if fund now covers membership — trigger auto-order if so
        checkAndTriggerAutoOrder(ownerId, db).catch(() => {});
      } else if (type === 'greenhouse_fund') {
        const greenhouseId = parseInt(pi.metadata.greenhouse_id);
        const userId = parseInt(pi.metadata.user_id);
        const years = parseInt(pi.metadata.years);
        const greenhouseName = pi.metadata.greenhouse_name;
        const greenhouseLocation = pi.metadata.greenhouse_location ?? '';

        // Get user display_name
        const [user] = await db.select({ display_name: users.display_name }).from(users).where(eq(users.id, userId));

        // Update greenhouse
        const termEndsAt = new Date();
        termEndsAt.setFullYear(termEndsAt.getFullYear() + years);

        await db.update(greenhouses).set({
          founding_patron_id: userId,
          founding_years: years,
          founding_term_ends_at: termEndsAt,
          funded_cents: pi.amount,
          status: 'open',
          opened_at: new Date(),
        }).where(eq(greenhouses.id, greenhouseId));

        // Update funding record
        await db.update(greenhouseFunding).set({ status: 'confirmed' })
          .where(eq(greenhouseFunding.stripe_payment_intent_id, pi.id));

        // Create provenance token with initial ledger entry
        const currentYear = new Date().getFullYear();
        const ledger = JSON.stringify([{
          user_id: userId,
          display_name: user?.display_name ?? 'Unknown',
          from_year: currentYear,
          to_year: currentYear + years,
          role: 'founder',
        }]);

        // Check if provenance token already exists for this greenhouse
        const [existing] = await db.select().from(provenanceTokens).where(eq(provenanceTokens.greenhouse_id, greenhouseId));
        if (!existing) {
          await db.insert(provenanceTokens).values({
            greenhouse_id: greenhouseId,
            provenance_ledger: ledger,
            greenhouse_name: greenhouseName,
            greenhouse_location: greenhouseLocation,
          });
        }

        // Push notification to founding patron
        const [foundingUser] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId));
        if (foundingUser?.push_token) {
          sendPushNotification(foundingUser.push_token, {
            title: 'Your greenhouse is open.',
            body: `${greenhouseName} · ${years}-year founding term begins now.`,
            data: { screen: 'greenhouses' },
          }).catch(() => {});
        }

        logger.info(`Greenhouse ${greenhouseId} funded by user ${userId} for ${years} year(s)`);
      } else if (type === 'location_fund') {
        const businessId = parseInt(pi.metadata.business_id);
        const userId = parseInt(pi.metadata.user_id);
        const businessName = pi.metadata.business_name;

        const termEndsAt = new Date();
        termEndsAt.setFullYear(termEndsAt.getFullYear() + 10);

        await db.update(businesses).set({
          founding_patron_id: userId,
          founding_term_ends_at: termEndsAt,
          inaugurated_at: new Date(),
        }).where(eq(businesses.id, businessId));

        await db.update(locationFunding).set({ status: 'confirmed' })
          .where(eq(locationFunding.stripe_payment_intent_id, pi.id));

        // Get user display_name for provenance record
        const [user] = await db.select({ display_name: users.display_name, push_token: users.push_token }).from(users).where(eq(users.id, userId));

        // Create provenance token for the location
        const currentYear = new Date().getFullYear();
        const ledger = JSON.stringify([{
          user_id: userId,
          display_name: user?.display_name ?? 'Unknown',
          from_year: currentYear,
          to_year: currentYear + 10,
          role: 'founder',
        }]);

        // Check if provenance token already exists for this location
        const existing = await db
          .select({ id: provenanceTokens.id })
          .from(provenanceTokens)
          .where(eq(provenanceTokens.location_id, businessId));

        if (existing.length === 0) {
          // Insert a provenance token using a dummy greenhouse_id workaround:
          // greenhouse_id is nullable now, so we can insert with null
          await db.insert(provenanceTokens).values({
            greenhouse_id: null as unknown as number,
            location_id: businessId,
            provenance_ledger: ledger,
            greenhouse_name: businessName,
            greenhouse_location: pi.metadata.partner_name ?? '',
          });
        }

        // Push notification
        if (user?.push_token) {
          sendPushNotification(user.push_token, {
            title: 'Your chocolate shop is inaugurated.',
            body: `${businessName} · 10-year founding term begins now.`,
            data: { screen: 'business-locations' },
          }).catch(() => {});
        }

        logger.info(`Location ${businessId} funded by user ${userId} (10-year founding term)`);
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
      } else if (type === 'patronage_claim') {
        // Release the hold so the patronage can be claimed again
        await db.update(seasonPatronages).set({ status: 'available' }).where(eq(seasonPatronages.stripe_payment_intent_id, pi.id));
      }
    }
  } catch (err) {
    // Log but return 200 — Stripe will retry on non-2xx responses
    logger.error('Webhook handler error', err);
  }

  res.json({ received: true });
});

export default router;
