import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import varietiesRouter from './routes/varieties';
import { locationsRouter, slotsRouter, timeSlotsPublicRouter } from './routes/locations';
import ordersRouter from './routes/orders';
import stripeRouter from './routes/stripe';
import adminRouter from './routes/admin';
import chocolatierRouter from './routes/chocolatier';
import supplierRouter from './routes/supplier';
import verifyRouter from './routes/verify';
import standingOrdersRouter from './routes/standing-orders';
import usersRouter from './routes/users';
import giftNoteRouter from './routes/gift-note';
import campaignsRouter from './routes/campaigns';
import businessesRouter from './routes/businesses';
import posRouter from './routes/pos';
import askRouter from './routes/ask';
import authRouter from './routes/auth';
import popupsRouter from './routes/popups';
import popupRequestsRouter from './routes/popup-requests';
import campaignCommissionsRouter from './routes/campaign-commissions';
import contractsRouter from './routes/contracts';
import searchRouter from './routes/search';
import { logger } from './lib/logger';

const app = express();

const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

// Raw body for Stripe webhook — must be registered before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/api/varieties', varietiesRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/time-slots', timeSlotsPublicRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/chocolatier', chocolatierRouter);
app.use('/api/supplier', supplierRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/standing-orders', standingOrdersRouter);
app.use('/api/users', usersRouter);
app.use('/api/gift-note', giftNoteRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/businesses', businessesRouter);
app.use('/api/pos', posRouter);
app.use('/api/ask', askRouter);
app.use('/api/auth', authRouter);
app.use('/api/popups', popupsRouter);
app.use('/api/popup-requests', popupRequestsRouter);
app.use('/api/campaign-commissions', campaignCommissionsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/search', searchRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(express.static(path.join(__dirname, '../public')));

app.get('/operator', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/operator.html'));
});

app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

app.get('/support', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/support.html'));
});

export default app;
