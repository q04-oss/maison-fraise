import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { jobPostings, jobApplications, jobInterviews, jobLedgerEntries, users, businesses } from '../db/schema';
import { requireUser } from '../lib/auth';

const router = Router();

// ─── Business: post a job ─────────────────────────────────────────────────────

// POST /api/jobs — operator posts a job listing
router.post('/', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const { title, description, pay_cents, pay_type } = req.body;

  const parsedPay = typeof pay_cents === 'number' ? pay_cents : parseInt(pay_cents, 10);
  if (!title || isNaN(parsedPay) || parsedPay <= 0) {
    res.status(400).json({ error: 'title and pay_cents (> 0) required' });
    return;
  }

  try {
    const [operator] = await db
      .select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, userId));

    if (!operator?.is_shop || !operator.business_id) {
      res.status(403).json({ error: 'Only shop operators can post jobs' });
      return;
    }

    const [job] = await db
      .insert(jobPostings)
      .values({
        business_id: operator.business_id,
        title: title.trim(),
        description: description?.trim() ?? null,
        pay_cents: parsedPay,
        pay_type: pay_type === 'salary' ? 'salary' : 'hourly',
      })
      .returning();

    res.json(job);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/jobs/:id/deactivate — operator closes a job listing
router.patch('/:id/deactivate', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  try {
    const [operator] = await db
      .select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, userId));

    const [job] = await db.select({ business_id: jobPostings.business_id }).from(jobPostings).where(eq(jobPostings.id, id));
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    if (!operator?.is_shop || operator.business_id !== job.business_id) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    await db.update(jobPostings).set({ active: false }).where(eq(jobPostings.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Discovery: nearby jobs via BLE ──────────────────────────────────────────

// GET /api/jobs/nearby?business_id=X — BLE-triggered, returns active jobs for a business
router.get('/nearby', requireUser, async (req: Request, res: Response) => {
  const businessId = parseInt(req.query.business_id as string, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'business_id required' }); return; }

  try {
    const jobs = await db
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        description: jobPostings.description,
        pay_cents: jobPostings.pay_cents,
        pay_type: jobPostings.pay_type,
        business_name: businesses.name,
        business_id: jobPostings.business_id,
      })
      .from(jobPostings)
      .leftJoin(businesses, eq(jobPostings.business_id, businesses.id))
      .where(and(eq(jobPostings.business_id, businessId), eq(jobPostings.active, true)));

    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Applications ─────────────────────────────────────────────────────────────

// POST /api/jobs/:id/apply — user applies for a job
router.post('/:id/apply', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) { res.status(400).json({ error: 'Invalid job id' }); return; }

  try {
    const [job] = await db.select().from(jobPostings).where(and(eq(jobPostings.id, jobId), eq(jobPostings.active, true)));
    if (!job) { res.status(404).json({ error: 'Job not found or no longer active' }); return; }

    const [existing] = await db
      .select()
      .from(jobApplications)
      .where(and(eq(jobApplications.job_id, jobId), eq(jobApplications.applicant_id, userId)));
    if (existing) { res.status(409).json({ error: 'Already applied' }); return; }

    const [application] = await db
      .insert(jobApplications)
      .values({ job_id: jobId, applicant_id: userId })
      .returning();

    res.json(application);
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'Already applied' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/jobs/applications/:id/schedule — operator schedules interview
router.post('/applications/:id/schedule', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const applicationId = parseInt(req.params.id, 10);
  if (isNaN(applicationId)) { res.status(400).json({ error: 'Invalid application id' }); return; }

  const { scheduled_at } = req.body;
  if (!scheduled_at) { res.status(400).json({ error: 'scheduled_at required' }); return; }

  try {
    const [operator] = await db
      .select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, userId));

    const [application] = await db
      .select({ id: jobApplications.id, job_id: jobApplications.job_id })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId));
    if (!application) { res.status(404).json({ error: 'Application not found' }); return; }

    const [job] = await db
      .select({ business_id: jobPostings.business_id })
      .from(jobPostings)
      .where(eq(jobPostings.id, application.job_id));

    if (!operator?.is_shop || operator.business_id !== job?.business_id) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    await db.update(jobApplications).set({ status: 'scheduled' }).where(eq(jobApplications.id, applicationId));

    const [interview] = await db
      .insert(jobInterviews)
      .values({ application_id: applicationId, scheduled_at: new Date(scheduled_at) })
      .returning();

    res.json(interview);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/jobs/applications/:id/outcome — operator records outcome
router.patch('/applications/:id/outcome', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const applicationId = parseInt(req.params.id, 10);
  if (isNaN(applicationId)) { res.status(400).json({ error: 'Invalid application id' }); return; }

  const { status } = req.body;
  const validStatuses = ['hired', 'not_hired', 'dismissed'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  try {
    const [operator] = await db
      .select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, userId));

    const [application] = await db
      .select({ id: jobApplications.id, job_id: jobApplications.job_id })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId));
    if (!application) { res.status(404).json({ error: 'Application not found' }); return; }

    const [job] = await db
      .select({ business_id: jobPostings.business_id })
      .from(jobPostings)
      .where(eq(jobPostings.id, application.job_id));

    if (!operator?.is_shop || operator.business_id !== job?.business_id) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(jobApplications).set({ status }).where(eq(jobApplications.id, applicationId));
      await tx
        .insert(jobLedgerEntries)
        .values({ application_id: applicationId })
        .onConflictDoNothing();
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Ledger statements ────────────────────────────────────────────────────────

// POST /api/jobs/applications/:id/statement — employer or candidate adds statement
router.post('/applications/:id/statement', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;
  const applicationId = parseInt(req.params.id, 10);
  if (isNaN(applicationId)) { res.status(400).json({ error: 'Invalid application id' }); return; }

  const { statement } = req.body;
  if (!statement?.trim()) { res.status(400).json({ error: 'statement required' }); return; }

  try {
    const [application] = await db
      .select({ applicant_id: jobApplications.applicant_id, job_id: jobApplications.job_id, status: jobApplications.status })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId));
    if (!application) { res.status(404).json({ error: 'Application not found' }); return; }

    const [job] = await db
      .select({ business_id: jobPostings.business_id })
      .from(jobPostings)
      .where(eq(jobPostings.id, application.job_id));

    const [operator] = await db
      .select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, userId));

    const isCandidate = application.applicant_id === userId;
    const isEmployer = operator?.is_shop && operator.business_id === job?.business_id;

    if (!isCandidate && !isEmployer) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    // Outcome must be set before statements are allowed
    const finalStatuses = ['hired', 'not_hired', 'dismissed'];
    if (!finalStatuses.includes(application.status)) {
      res.status(400).json({ error: 'Outcome must be recorded before adding a statement' });
      return;
    }

    const update = isEmployer
      ? { employer_statement: statement.trim() }
      : { candidate_statement: statement.trim() };

    await db
      .insert(jobLedgerEntries)
      .values({ application_id: applicationId, ...update })
      .onConflictDoUpdate({ target: jobLedgerEntries.application_id, set: update });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Public ledger ────────────────────────────────────────────────────────────

// GET /api/jobs/ledger/:businessId — public hiring history for a business profile
router.get('/ledger/:businessId', async (req: Request, res: Response) => {
  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) { res.status(400).json({ error: 'Invalid business id' }); return; }

  try {
    const rows = await db
      .select({
        application_id: jobApplications.id,
        job_title: jobPostings.title,
        pay_cents: jobPostings.pay_cents,
        pay_type: jobPostings.pay_type,
        applicant_name: users.display_name,
        applicant_code: users.user_code,
        status: jobApplications.status,
        employer_statement: jobLedgerEntries.employer_statement,
        candidate_statement: jobLedgerEntries.candidate_statement,
        applied_at: jobApplications.created_at,
      })
      .from(jobApplications)
      .innerJoin(jobPostings, eq(jobApplications.job_id, jobPostings.id))
      .innerJoin(users, eq(jobApplications.applicant_id, users.id))
      .leftJoin(jobLedgerEntries, eq(jobLedgerEntries.application_id, jobApplications.id))
      .where(eq(jobPostings.business_id, businessId))
      .orderBy(desc(jobApplications.created_at));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/operator — operator's own job listings + applications
router.get('/operator', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;

  try {
    const [operator] = await db
      .select({ business_id: users.business_id, is_shop: users.is_shop })
      .from(users)
      .where(eq(users.id, userId));

    if (!operator?.is_shop || !operator.business_id) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const jobs = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.business_id, operator.business_id))
      .orderBy(desc(jobPostings.created_at));

    const applications = await db
      .select({
        id: jobApplications.id,
        job_id: jobApplications.job_id,
        job_title: jobPostings.title,
        status: jobApplications.status,
        applicant_name: users.display_name,
        applicant_code: users.user_code,
        applied_at: jobApplications.created_at,
      })
      .from(jobApplications)
      .innerJoin(jobPostings, eq(jobApplications.job_id, jobPostings.id))
      .innerJoin(users, eq(jobApplications.applicant_id, users.id))
      .where(eq(jobPostings.business_id, operator.business_id))
      .orderBy(desc(jobApplications.created_at));

    res.json({ jobs, applications });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/history/:userId — public hiring history for a user profile
router.get('/history/:userId', async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) { res.status(400).json({ error: 'Invalid user id' }); return; }

  try {
    const rows = await db
      .select({
        application_id: jobApplications.id,
        job_title: jobPostings.title,
        pay_cents: jobPostings.pay_cents,
        pay_type: jobPostings.pay_type,
        business_name: businesses.name,
        business_id: jobPostings.business_id,
        status: jobApplications.status,
        employer_statement: jobLedgerEntries.employer_statement,
        candidate_statement: jobLedgerEntries.candidate_statement,
        applied_at: jobApplications.created_at,
      })
      .from(jobApplications)
      .innerJoin(jobPostings, eq(jobApplications.job_id, jobPostings.id))
      .innerJoin(businesses, eq(jobPostings.business_id, businesses.id))
      .leftJoin(jobLedgerEntries, eq(jobLedgerEntries.application_id, jobApplications.id))
      .where(eq(jobApplications.applicant_id, userId))
      .orderBy(desc(jobApplications.created_at));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/jobs/my-history — authenticated user's own hiring history
router.get('/my-history', requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).userId as number;

  try {
    const rows = await db
      .select({
        application_id: jobApplications.id,
        job_title: jobPostings.title,
        pay_cents: jobPostings.pay_cents,
        pay_type: jobPostings.pay_type,
        business_name: businesses.name,
        business_id: jobPostings.business_id,
        status: jobApplications.status,
        employer_statement: jobLedgerEntries.employer_statement,
        candidate_statement: jobLedgerEntries.candidate_statement,
        applied_at: jobApplications.created_at,
      })
      .from(jobApplications)
      .innerJoin(jobPostings, eq(jobApplications.job_id, jobPostings.id))
      .innerJoin(businesses, eq(jobPostings.business_id, businesses.id))
      .leftJoin(jobLedgerEntries, eq(jobLedgerEntries.application_id, jobApplications.id))
      .where(eq(jobApplications.applicant_id, userId))
      .orderBy(desc(jobApplications.created_at));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
