import 'dotenv/config';
import express from 'express';
import path from 'path';
import varietiesRouter from './routes/varieties';
import { locationsRouter, slotsRouter } from './routes/locations';
import ordersRouter from './routes/orders';
import stripeRouter from './routes/stripe';
import adminRouter from './routes/admin';
import chocolatierRouter from './routes/chocolatier';
import supplierRouter from './routes/supplier';
import { logger } from './lib/logger';

const app = express();

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
app.use('/api/orders', ordersRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/chocolatier', chocolatierRouter);
app.use('/api/supplier', supplierRouter);

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
