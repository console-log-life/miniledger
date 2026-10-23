import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AppConfig } from './config';
import type { Db } from './db';
import { OtpService } from './otp';

type AuthedRequest = Request & { user?: { id: string; phone: string } };

const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/));

const loanSchema = z.object({
  friendName: z.string().trim().min(1).max(120),
  amount: z.coerce
    .number()
    .positive()
    .max(9_999_999_999.99)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'At most 2 decimal places'),
  dueDate: z.iso.date(),
});

const LOAN_COLUMNS = `id::text AS id, friend_name AS "friendName", amount::float AS amount,
  to_char(due_date, 'YYYY-MM-DD') AS "dueDate", repaid, repaid_at AS "repaidAt",
  created_at AS "createdAt"`;

export function createApp({ db, config, otp = new OtpService() }: {
  db: Db;
  config: AppConfig;
  otp?: OtpService;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins ?? true }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (error) {
      console.error('[health] database check failed:', (error as Error).message);
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  // --- Auth -----------------------------------------------------------------
  // Demo-only OTP flow: no SMS provider is configured. Outside production the
  // OTP is printed in the server terminal (and optionally returned in the
  // response when DEMO_OTP_IN_RESPONSE=true). Production never exposes it.

  app.post('/api/auth/request-otp', (req, res) => {
    const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Enter a valid phone number (10–15 digits, optional +).' });
    }

    const { phone } = parsed.data;
    const issued = otp.issue(phone);
    if (!issued.ok) {
      res.setHeader('Retry-After', String(issued.retryAfterSeconds));
      return res.status(429).json({
        error: `Please wait ${issued.retryAfterSeconds}s before requesting another OTP.`,
        retryAfterSeconds: issued.retryAfterSeconds,
      });
    }

    if (!config.isProduction) {
      console.log(`[DEMO OTP] ${phone}: ${issued.otp} (valid ${issued.expiresInSeconds / 60} min)`);
    }

    return res.json({
      message: config.isProduction
        ? 'OTP generated.'
        : 'Demo OTP generated. Check the backend terminal.',
      phone,
      expiresInSeconds: issued.expiresInSeconds,
      ...(config.exposeDemoOtp ? { devOtp: issued.otp } : {}),
    });
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    const parsed = z
      .object({ phone: phoneSchema, otp: z.string().trim().regex(/^[0-9]{6}$/) })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Enter the 6-digit OTP.' });
    }

    const { phone } = parsed.data;
    const result = otp.verify(phone, parsed.data.otp);
    if (!result.ok) {
      switch (result.reason) {
        case 'missing':
          return res.status(401).json({ error: 'No active OTP for this number. Request a new one.' });
        case 'expired':
          return res.status(401).json({ error: 'This OTP has expired. Request a new one.' });
        case 'locked':
          return res.status(429).json({ error: 'Too many incorrect attempts. Request a new OTP.' });
        case 'mismatch':
          return res.status(401).json({
            error: `Incorrect OTP. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`,
          });
      }
    }

    const { rows } = await db.query<{ id: string; phone: string }>(
      `INSERT INTO users (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id::text AS id, phone`,
      [phone],
    );
    const user = rows[0];
    const token = jwt.sign({ phone: user.phone }, config.jwtSecret, {
      subject: user.id,
      expiresIn: '7d',
    });

    return res.json({ message: 'Login successful', token, user });
  });

  function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Sign in to continue.' });
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      if (!payload.sub || typeof payload.phone !== 'string') throw new Error('bad payload');
      req.user = { id: payload.sub, phone: payload.phone };
      next();
    } catch {
      return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    }
  }

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  // --- Loans ----------------------------------------------------------------

  const parseId = (raw: unknown) => (typeof raw === 'string' && /^[1-9][0-9]{0,17}$/.test(raw) ? raw : null);

  app.get('/api/loans', requireAuth, async (req: AuthedRequest, res) => {
    const { rows } = await db.query(
      `SELECT ${LOAN_COLUMNS} FROM loans
       WHERE user_id = $1
       ORDER BY repaid ASC, due_date ASC, id DESC`,
      [req.user!.id],
    );
    res.json(rows);
  });

  app.post('/api/loans', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = loanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Provide a name (max 120 chars), a positive amount with up to 2 decimals, and a valid due date (YYYY-MM-DD).',
      });
    }

    const { friendName, amount, dueDate } = parsed.data;
    const { rows } = await db.query(
      `INSERT INTO loans (user_id, friend_name, amount, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING ${LOAN_COLUMNS}`,
      [req.user!.id, friendName, amount, dueDate],
    );
    res.status(201).json(rows[0]);
  });

  app.patch('/api/loans/:id/repay', requireAuth, async (req: AuthedRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid loan ID' });

    const result = await db.query(
      `UPDATE loans SET repaid = TRUE, repaid_at = NOW()
       WHERE id = $1 AND user_id = $2 AND repaid = FALSE
       RETURNING ${LOAN_COLUMNS}`,
      [id, req.user!.id],
    );
    if (result.rowCount) return res.json(result.rows[0]);

    const existing = await db.query('SELECT 1 FROM loans WHERE id = $1 AND user_id = $2', [id, req.user!.id]);
    return existing.rowCount
      ? res.status(409).json({ error: 'Loan is already marked as repaid' })
      : res.status(404).json({ error: 'Loan not found' });
  });

  app.delete('/api/loans/:id', requireAuth, async (req: AuthedRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid loan ID' });

    const result = await db.query('DELETE FROM loans WHERE id = $1 AND user_id = $2', [id, req.user!.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Loan not found' });
    res.status(204).end();
  });

  app.get('/api/summary', requireAuth, async (req: AuthedRequest, res) => {
    const { rows } = await db.query(
      `SELECT
         COALESCE(SUM(amount), 0)::float AS "totalLent",
         COALESCE(SUM(amount) FILTER (WHERE repaid), 0)::float AS "totalRepaid",
         COALESCE(SUM(amount) FILTER (WHERE NOT repaid), 0)::float AS "outstandingAmount",
         COALESCE(SUM(amount) FILTER (WHERE NOT repaid AND due_date < CURRENT_DATE), 0)::float AS "overdueAmount",
         COUNT(*)::int AS "loanCount"
       FROM loans
       WHERE user_id = $1`,
      [req.user!.id],
    );
    res.json(rows[0]);
  });

  // --- Fallbacks ------------------------------------------------------------

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Express 5 forwards rejected async handlers here.
  app.use((error: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    console.error('[api] unhandled error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
