import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { eq, sql, and, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { stripe } from '../lib/stripe';
import { db } from '../db';
import { orders, varieties, timeSlots, popupRsvps, popupRequests, campaignCommissions, users, businesses, memberships, fundContributions, earningsLedger, portalAccess, tokens, seasonPatronages, patronTokens, greenhouses, greenhouseFunding, provenanceTokens, locationFunding, messages, collectifs, collectifCommitments, tournaments, tournamentEntries, adCampaigns, toiletVisits, personalToilets } from '../db/schema';
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

        // Generate NFC token
        const nfc_token = crypto.randomBytes(4).toString('hex');

        // Decrement stock (guarded) and insert order atomically
        const newOrder = await db.transaction(async (tx) => {
          const stockResult = await tx
            .update(varieties)
            .set({ stock_remaining: sql`${varieties.stock_remaining} - ${quantity}` })
            .where(and(eq(varieties.id, variety_id), sql`${varieties.stock_remaining} >= ${quantity}`))
            .returning({ stock_remaining: varieties.stock_remaining });
          if (stockResult.length === 0) {
            logger.error(`Webhook: insufficient stock for variety ${variety_id}, quantity ${quantity}`);
            throw Object.assign(new Error('out_of_stock'), { status: 409 });
          }

          const [inserted] = await tx
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
          return inserted;
        });

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

        // Mint a token for every box — the NFC chip is always the physical anchor
        const metadata = pi.metadata;
        const excessCents = parseInt(metadata.excess_amount_cents ?? '0', 10);
        try {
          const [orderUser] = await db
            .select({ id: users.id, push_token: users.push_token })
            .from(users)
            .where(eq(users.email, customer_email));

          if (orderUser) {
            const [variety] = await db
              .select({ name: varieties.name, variety_type: varieties.variety_type })
              .from(varieties)
              .where(eq(varieties.id, variety_id));
            const [location] = await db
              .select({ name: timeSlots.time })
              .from(timeSlots)
              .where(eq(timeSlots.id, time_slot_id));
            const [orderBusiness] = await db
              .select({
                partner_name: businesses.partner_name,
                location_type: businesses.location_type,
              })
              .from(businesses)
              .where(eq(businesses.id, location_id));

            const isChocolate = variety?.variety_type === 'chocolate';

            // Seed visuals from the NFC chip's unique identifier — each box has its own character
            // Excess payment enhances the token on top of the base
            const seed = parseInt(nfc_token, 16);
            const visuals = computeTokenVisuals(seed, isNaN(excessCents) ? 0 : excessCents);
            const tokenNumber = await getNextTokenNumber(variety_id, db, tokens, eq);

            const [mintedToken] = await db
              .insert(tokens)
              .values({
                token_number: tokenNumber,
                variety_id: newOrder.variety_id,
                order_id: newOrder.id,
                original_owner_id: orderUser.id,
                current_owner_id: orderUser.id,
                excess_amount_cents: isNaN(excessCents) ? 0 : excessCents,
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
              const body = excessCents > 0
                ? `${variety?.name ?? 'Variety'} · CA$${(excessCents / 100).toFixed(2)} above price — enhanced`
                : `${variety?.name ?? 'Variety'} · collect at the shop`;
              sendPushNotification(orderUser.push_token, {
                title: `Token #${tokenNumber} minted`,
                body,
                data: { screen: 'tokens', token_id: mintedToken.id },
              }).catch(() => {});
            }

            logger.info(`Token #${tokenNumber} minted for order ${newOrder.id}${excessCents > 0 ? ` (enhanced, CA$${(excessCents / 100).toFixed(2)} excess)` : ''}`);
          }
        } catch (tokenErr) {
          logger.error('Token minting failed', tokenErr);
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
                    title: 'You have a gift order from Box Fraise 🍓',
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
            title: 'Welcome to Box Fraise',
            body: `Your ${TIER_LABELS[tier] ?? tier} membership is now active.`,
            data: { screen: 'membership' },
          }).catch(() => {});
        }
      } else if (type === 'membership_renewal') {
        const { tier, user_id, credit_applied_cents } = pi.metadata;
        const userId = parseInt(user_id, 10);
        const creditApplied = credit_applied_cents ? parseInt(credit_applied_cents, 10) : 0;
        const now = new Date();
        const renews = new Date(now);
        renews.setFullYear(renews.getFullYear() + 1);
        await db.update(memberships).set({
          status: 'active',
          started_at: now,
          renews_at: renews,
          stripe_payment_intent_id: pi.id,
        }).where(and(eq(memberships.user_id, userId), eq(memberships.status, 'pending')));
        // Debit any earnings credit that was applied to reduce the charge
        if (creditApplied > 0) {
          await db.insert(earningsLedger).values({
            user_id: userId,
            amount_cents: creditApplied,
            type: 'debit',
            description: `Applied to ${tier} membership renewal`,
          });
        }
        const [user] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId));
        if (user?.push_token) {
          sendPushNotification(user.push_token, {
            title: 'Membership renewed',
            body: `Your ${TIER_LABELS[tier] ?? tier} membership has been renewed.`,
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
          // Single fund: credit earningsLedger directly
          await db.insert(earningsLedger).values({
            user_id: toUserId,
            amount_cents: amount,
            type: 'credit',
            description: fromUserId ? 'Membership contribution received' : 'Anonymous membership contribution',
          });
          const [recipient] = await db.select({ push_token: users.push_token, display_name: users.display_name }).from(users).where(eq(users.id, toUserId));
          if (recipient?.push_token) {
            const fromLabel = fromUserId ? 'Someone' : 'An anonymous member';
            sendPushNotification(recipient.push_token, {
              title: 'Membership contribution',
              body: `${fromLabel} contributed CA$${(amount / 100).toFixed(2)} to your fund.`,
              data: { screen: 'membership' },
            }).catch(() => {});
          }
        }
      } else if (type === 'patronage_claim') {
        const patronageId = parseInt(pi.metadata.patronage_id, 10);
        const userId = parseInt(pi.metadata.user_id, 10);
        const years = parseInt(pi.metadata.years, 10);
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
        const greenhouseId = parseInt(pi.metadata.greenhouse_id, 10);
        const userId = parseInt(pi.metadata.user_id, 10);
        const years = parseInt(pi.metadata.years, 10);
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
        const businessId = parseInt(pi.metadata.business_id, 10);
        const userId = parseInt(pi.metadata.user_id, 10);
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
      } else if (type === 'collectif_commitment') {
        const collectifId = parseInt(pi.metadata.collectif_id, 10);
        const userId = parseInt(pi.metadata.user_id, 10);
        const quantity = parseInt(pi.metadata.quantity, 10);

        const [existingCommitment] = await db
          .select({ id: collectifCommitments.id })
          .from(collectifCommitments)
          .where(eq(collectifCommitments.payment_intent_id, pi.id))
          .limit(1);

        if (!existingCommitment) {
          await db.update(collectifCommitments)
            .set({ status: 'captured' })
            .where(eq(collectifCommitments.payment_intent_id, pi.id));

          const [updated] = await db.update(collectifs)
            .set({ current_quantity: sql`${collectifs.current_quantity} + ${quantity}` })
            .where(eq(collectifs.id, collectifId))
            .returning({ current_quantity: collectifs.current_quantity, target_quantity: collectifs.target_quantity, title: collectifs.title, status: collectifs.status, collectif_type: collectifs.collectif_type, proposed_venue: collectifs.proposed_venue, proposed_date: collectifs.proposed_date, milestone_50_sent: sql<boolean>`milestone_50_sent`, milestone_75_sent: sql<boolean>`milestone_75_sent` } as any);

          if (updated && (updated as any).current_quantity >= (updated as any).target_quantity && (updated as any).status === 'open') {
            await db.update(collectifs).set({ status: 'funded' }).where(eq(collectifs.id, collectifId));

            const isPopup = (updated as any).collectif_type === 'popup';
            const opPushBody = isPopup
              ? `${(updated as any).current_quantity} people want a popup at ${(updated as any).proposed_venue ?? 'unknown venue'} on ${(updated as any).proposed_date ?? 'TBD'} — confirm the event.`
              : `"${(updated as any).title}" hit its target — respond to the group.`;

            // Push operator
            db.select({ push_token: users.push_token })
              .from(users)
              .where(eq(users.email, process.env.OPERATOR_EMAIL ?? 'operator@box-fraise.com'))
              .limit(1)
              .then(([op]) => {
                if (op?.push_token) {
                  return sendPushNotification(op.push_token, {
                    title: isPopup ? 'Popup proposed' : 'Collectif funded',
                    body: opPushBody,
                    data: { screen: 'collectifs' },
                  });
                }
              })
              .catch(() => {});

            // Push all committed members (combined funded + standing order offer for product)
            db.select({ user_id: collectifCommitments.user_id })
              .from(collectifCommitments)
              .where(and(eq(collectifCommitments.collectif_id, collectifId), eq(collectifCommitments.status, 'captured')))
              .then(async (commitments) => {
                const memberIds = commitments.map(c => c.user_id);
                if (memberIds.length === 0) return;
                const members = await db.select({ push_token: users.push_token }).from(users).where(inArray(users.id, memberIds));
                const memberTitle = isPopup ? 'Popup is happening!' : 'Collectif funded!';
                const memberBody = isPopup
                  ? `The target was reached — awaiting business confirmation.`
                  : `"${(updated as any).title}" is funded. Want this regularly? Set up a standing order.`;
                for (const m of members) {
                  if (m.push_token) {
                    sendPushNotification(m.push_token, {
                      title: memberTitle,
                      body: memberBody,
                      data: { screen: isPopup ? 'collectifs' : 'standingOrder', collectif_id: String(collectifId) },
                    }).catch(() => {});
                  }
                }
              })
              .catch(() => {});
          } else if (updated && (updated as any).status === 'open') {
            // Milestone pushes (50% and 75%)
            const current = (updated as any).current_quantity as number;
            const target = (updated as any).target_quantity as number;
            const pct = current / target;

            const shouldPush50 = pct >= 0.5 && !(updated as any).milestone_50_sent;
            const shouldPush75 = pct >= 0.75 && !(updated as any).milestone_75_sent;

            if (shouldPush50 || shouldPush75) {
              const col = shouldPush75 ? 'milestone_75_sent' : 'milestone_50_sent';
              const label = shouldPush75 ? '75%' : '50%';

              // Atomically mark sent to avoid double-push
              const [marked] = await db.execute(sql`
                UPDATE collectifs
                SET ${sql.raw(col)} = true
                WHERE id = ${collectifId}
                  AND ${sql.raw(col)} = false
                RETURNING id
              `).catch(() => [null]);

              if (marked) {
                db.select({ user_id: collectifCommitments.user_id })
                  .from(collectifCommitments)
                  .where(and(eq(collectifCommitments.collectif_id, collectifId), eq(collectifCommitments.status, 'captured')))
                  .then(async (commitments) => {
                    const memberIds = commitments.map(c => c.user_id);
                    if (memberIds.length === 0) return;
                    const members = await db.select({ push_token: users.push_token }).from(users).where(inArray(users.id, memberIds));
                    for (const m of members) {
                      if (m.push_token) {
                        sendPushNotification(m.push_token, {
                          title: `${label} of the way there`,
                          body: `"${(updated as any).title}" is ${label} funded. Share it to push it over the line.`,
                          data: { screen: 'collectifs', collectif_id: String(collectifId) },
                        }).catch(() => {});
                      }
                    }
                  })
                  .catch(() => {});
              }
            }
          }

          logger.info(`Collectif ${collectifId} commitment captured for user ${userId}`);
        }
      } else if (type === 'market_order') {
        await db.execute(sql`
          UPDATE market_orders SET status = 'paid' WHERE payment_intent_id = ${pi.id}
        `);
        // Decrement stock if the product has a finite quantity tracked
        const productId = parseInt(pi.metadata.product_id, 10);
        const qty = parseInt(pi.metadata.quantity, 10);
        if (!isNaN(productId) && !isNaN(qty)) {
          await db.execute(sql`
            UPDATE market_products
            SET stock_quantity = GREATEST(0, stock_quantity - ${qty})
            WHERE id = ${productId} AND stock_quantity IS NOT NULL
          `);
        }
        logger.info(`Market order paid: ${pi.id}`);
      } else if (type === 'verification_fee') {
        const userId = parseInt(pi.metadata?.user_id ?? '', 10);
        if (!isNaN(userId)) {
          await db.execute(sql`
            UPDATE verification_payments SET status = 'paid' WHERE stripe_payment_intent_id = ${pi.id}
          `);
          const [user] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId)).limit(1);
          if (user?.push_token) {
            sendPushNotification(user.push_token, {
              title: 'Verification fee received',
              body: 'Open your app to complete your identity scan.',
              data: { screen: 'portal' },
            }).catch(() => {});
          }
          logger.info(`Verification fee paid for user ${userId}`);
        }
      } else if (type === 'verification_renewal') {
        const userId = parseInt(pi.metadata?.user_id ?? '', 10);
        if (!isNaN(userId)) {
          await db.execute(sql`
            UPDATE verification_payments SET status = 'paid' WHERE stripe_payment_intent_id = ${pi.id}
          `);
          await db.execute(sql`
            UPDATE users
            SET verification_renewal_due_at = COALESCE(verification_renewal_due_at, now()) + interval '1 year'
            WHERE id = ${userId}
          `);
          const [user] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId)).limit(1);
          if (user?.push_token) {
            sendPushNotification(user.push_token, {
              title: 'Verified — renewed',
              body: 'Your verified status has been renewed for one year.',
              data: { screen: 'terminal' },
            }).catch(() => {});
          }
          logger.info(`Verification renewed for user ${userId}`);
        }
      } else if (type === 'tournament_entry') {
        const tournamentId = parseInt(pi.metadata?.tournament_id ?? '', 10);
        const userId = parseInt(pi.metadata?.user_id ?? '', 10);
        if (!isNaN(tournamentId) && !isNaN(userId)) {
          // Idempotent: only mark paid and accumulate pool if the entry is still pending.
          // If already paid (webhook retry), both updates are skipped.
          const updated = await db
            .update(tournamentEntries)
            .set({ status: 'paid' })
            .where(
              and(
                eq(tournamentEntries.stripe_payment_intent_id, pi.id),
                eq(tournamentEntries.status, 'pending'),
              ),
            )
            .returning({ id: tournamentEntries.id });

          if (updated.length === 0) {
            // Already processed — skip prize pool update to prevent double-counting
            res.json({ received: true });
            return;
          }

          // Accumulate prize pool only on first successful mark
          await db
            .update(tournaments)
            .set({ prize_pool_cents: sql`prize_pool_cents + ${pi.amount}` })
            .where(eq(tournaments.id, tournamentId));

          const [user] = await db
            .select({ push_token: users.push_token })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          const [tournament] = await db
            .select({ name: tournaments.name })
            .from(tournaments)
            .where(eq(tournaments.id, tournamentId))
            .limit(1);

          if (user?.push_token) {
            sendPushNotification(user.push_token, {
              title: 'Tournament entry confirmed',
              body: `You're entered in ${tournament?.name ?? 'the tournament'}. See you at the table.`,
              data: { screen: 'tournaments', tournament_id: tournamentId },
            }).catch(() => {});
          }
          logger.info(`Tournament entry paid: tournament ${tournamentId}, user ${userId}`);
        }
      } else if (type === 'ad_budget') {
        const campaignId = parseInt(pi.metadata?.campaign_id ?? '', 10);
        const amountCents = pi.amount_received ?? pi.amount;
        if (!isNaN(campaignId) && amountCents > 0) {
          await db.update(adCampaigns)
            .set({ budget_cents: sql`${adCampaigns.budget_cents} + ${amountCents}` })
            .where(eq(adCampaigns.id, campaignId));
          logger.info(`Ad campaign ${campaignId} funded: +${amountCents} cents`);
        }
      } else if (type === 'toilet_visit') {
        const visitId = parseInt(pi.metadata?.visit_id ?? '', 10);
        if (!isNaN(visitId)) {
          const code = String(Math.floor(1000 + Math.random() * 9000));
          const expires = new Date(Date.now() + 15 * 60 * 1000);
          await db.update(toiletVisits).set({ paid: true, access_code: code, access_code_expires_at: expires })
            .where(and(eq(toiletVisits.id, visitId), eq(toiletVisits.paid, false)));
          logger.info(`Toilet visit ${visitId} paid via Stripe`);
        }
      } else if (type === 'personal_toilet_visit') {
        const visitId = parseInt(pi.metadata?.visit_id ?? '', 10);
        const hostUserId = parseInt(pi.metadata?.host_user_id ?? '', 10);
        const listingTitle = pi.metadata?.listing_title ?? 'your toilet';
        const amountCents = pi.amount_received ?? pi.amount;
        if (!isNaN(visitId) && !isNaN(hostUserId)) {
          const code = String(Math.floor(1000 + Math.random() * 9000));
          const expires = new Date(Date.now() + 15 * 60 * 1000);
          await db.update(toiletVisits).set({ paid: true, access_code: code, access_code_expires_at: expires })
            .where(and(eq(toiletVisits.id, visitId), eq(toiletVisits.paid, false)));
          // Credit host
          await db.update(users)
            .set({ ad_balance_cents: sql`${users.ad_balance_cents} + ${amountCents}` })
            .where(eq(users.id, hostUserId));
          // Notify host
          const [host] = await db.select({ push_token: users.push_token })
            .from(users).where(eq(users.id, hostUserId));
          if (host?.push_token) {
            sendPushNotification(host.push_token, {
              title: 'Someone is visiting your toilet',
              body: `CA$${(amountCents / 100).toFixed(2)} earned from "${listingTitle}"`,
              data: { screen: 'terminal' },
            }).catch(() => {});
          }
          logger.info(`Personal toilet visit ${visitId} paid, host ${hostUserId} credited ${amountCents}c`);
        }
      }
    }

    if (event.type === 'identity.verification_session.verified') {
      const session = event.data.object as any;
      const userId = parseInt(session.metadata?.user_id ?? '', 10);
      if (!isNaN(userId)) {
        // Extract what Stripe verified from the document
        const outputs = session.verified_outputs ?? {};
        const firstName = outputs.first_name ?? '';
        const lastName = outputs.last_name ?? '';
        const verifiedName = [firstName, lastName].filter(Boolean).join(' ') || null;
        const dob = outputs.dob;
        const verifiedDob = dob
          ? `${dob.year}-${String(dob.month).padStart(2, '0')}-${String(dob.day).padStart(2, '0')}`
          : null;

        // Check fee was paid before awarding the verified badge
        const feeRows = await db.execute(sql`
          SELECT id FROM verification_payments
          WHERE user_id = ${userId} AND type = 'initial' AND status = 'paid' LIMIT 1
        `);
        const feePaid = (feeRows as any).length > 0;

        if (!feePaid) {
          logger.warn(`User ${userId} identity scan completed but verification fee not paid — badge withheld`);
        } else {
          await db.execute(sql`
            UPDATE users
            SET identity_verified = true,
                identity_verified_at = NOW(),
                identity_session_id = NULL,
                id_verified_name = ${verifiedName},
                id_verified_dob = ${verifiedDob},
                identity_verified_expires_at = NOW() + interval '2 years',
                verification_renewal_due_at = NOW() + interval '1 year'
            WHERE id = ${userId}
          `);

          // Update log: record Stripe's extracted data and mark verified
          await db.execute(sql`
            UPDATE id_attestation_log
            SET outcome = 'verified', id_verified_name = ${verifiedName}, id_verified_dob = ${verifiedDob}
            WHERE stripe_session_id = ${session.id}
          `).catch(() => {});

          const [user] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId)).limit(1);
          if (user?.push_token) {
            sendPushNotification(user.push_token, {
              title: 'Verified',
              body: 'Your identity has been verified. Your verified badge is now active.',
              data: { screen: 'terminal' },
            }).catch(() => {});
          }
          logger.info(`User ${userId} identity verified via Stripe Identity`);
        }
      }
    }

    if (event.type === 'identity.verification_session.requires_input') {
      // Verification failed or needs resubmission — clear session so operator can restart
      const session = event.data.object as any;
      const userId = parseInt(session.metadata?.user_id ?? '', 10);
      if (!isNaN(userId)) {
        await db.execute(sql`UPDATE users SET identity_session_id = NULL WHERE id = ${userId}`);

        // Mark log entry as failed
        await db.execute(sql`
          UPDATE id_attestation_log SET outcome = 'failed'
          WHERE stripe_session_id = ${session.id}
        `).catch(() => {});

        const [user] = await db.select({ push_token: users.push_token }).from(users).where(eq(users.id, userId)).limit(1);
        if (user?.push_token) {
          sendPushNotification(user.push_token, {
            title: 'Verification incomplete',
            body: 'Your ID verification could not be completed. Please visit the shop to try again.',
            data: { screen: 'portal' },
          }).catch(() => {});
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
      } else if (type === 'patronage_claim') {
        // Release the hold so the patronage can be claimed again
        await db.update(seasonPatronages).set({ status: 'available' }).where(eq(seasonPatronages.stripe_payment_intent_id, pi.id));
      }
    }
  } catch (err) {
    logger.error('Webhook handler error', err);
    res.status(500).json({ received: false });
    return;
  }

  res.json({ received: true });
});

export default router;
