"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const zod_1 = require("zod");
const db_1 = require("./db");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const port = Number(process.env.PORT || 3000);
app.get('/api/health', async (_req, res) => {
    try {
        await db_1.pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    }
    catch {
        res.status(500).json({ error: 'Database connection failed' });
    }
});
// Demo-only OTP flow: OTP is printed in the server terminal.
const otpStore = new Map();
app.post('/api/auth/request-otp', (req, res) => {
    const parsed = zod_1.z.object({
        phone: zod_1.z.string().trim().regex(/^\+?[0-9]{10,15}$/),
    }).safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Enter a valid phone number' });
    }
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(parsed.data.phone, otp);
    console.log(`[DEMO OTP] ${parsed.data.phone}: ${otp}`);
    return res.json({ message: 'Demo OTP generated. Check server logs.' });
});
app.post('/api/auth/verify-otp', (req, res) => {
    const parsed = zod_1.z.object({
        phone: zod_1.z.string().trim().regex(/^\+?[0-9]{10,15}$/),
        otp: zod_1.z.string().regex(/^[0-9]{6}$/),
    }).safeParse(req.body);
    if (!parsed.success || otpStore.get(parsed.data.phone) !== parsed.data.otp) {
        return res.status(401).json({ error: 'Invalid OTP' });
    }
    otpStore.delete(parsed.data.phone);
    return res.json({
        message: 'Demo login successful',
        user: { phone: parsed.data.phone },
    });
});
const loanSchema = zod_1.z.object({
    friendName: zod_1.z.string().trim().min(1).max(120),
    amount: zod_1.z.coerce.number().positive().finite(),
    dueDate: zod_1.z.string().date(),
});
app.get('/api/loans', async (_req, res) => {
    try {
        const result = await db_1.pool.query(`SELECT id, friend_name AS "friendName", amount::float AS amount,
       due_date AS "dueDate", repaid, repaid_at AS "repaidAt",
       created_at AS "createdAt"
       FROM loans ORDER BY due_date ASC, id DESC`);
        res.json(result.rows);
    }
    catch {
        res.status(500).json({ error: 'Could not fetch loans' });
    }
});
app.post('/api/loans', async (req, res) => {
    const parsed = loanSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Provide a name, positive amount and valid due date' });
    }
    try {
        const { friendName, amount, dueDate } = parsed.data;
        const result = await db_1.pool.query(`INSERT INTO loans (friend_name, amount, due_date)
       VALUES ($1, $2, $3)
       RETURNING id, friend_name AS "friendName", amount::float AS amount,
       due_date AS "dueDate", repaid`, [friendName, amount, dueDate]);
        res.status(201).json(result.rows[0]);
    }
    catch {
        res.status(500).json({ error: 'Could not create loan' });
    }
});
app.patch('/api/loans/:id/repay', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid loan ID' });
    }
    try {
        const result = await db_1.pool.query(`UPDATE loans SET repaid = TRUE, repaid_at = NOW()
       WHERE id = $1 AND repaid = FALSE
       RETURNING id, friend_name AS "friendName", amount::float AS amount,
       due_date AS "dueDate", repaid, repaid_at AS "repaidAt"`, [id]);
        if (!result.rowCount) {
            return res.status(404).json({ error: 'Loan not found or already repaid' });
        }
        res.json(result.rows[0]);
    }
    catch {
        res.status(500).json({ error: 'Could not mark loan as repaid' });
    }
});
app.get('/api/summary', async (_req, res) => {
    try {
        const result = await db_1.pool.query(`
      SELECT
        COALESCE(SUM(amount), 0)::float AS "totalLent",
        COALESCE(SUM(amount) FILTER (WHERE repaid), 0)::float AS "totalRepaid",
        COALESCE(SUM(amount) FILTER (
          WHERE NOT repaid AND due_date < CURRENT_DATE
        ), 0)::float AS "overdueAmount"
      FROM loans
    `);
        res.json(result.rows[0]);
    }
    catch {
        res.status(500).json({ error: 'Could not calculate summary' });
    }
});
app.listen(port, () => {
    console.log(`MiniLedger API running on port ${port}`);
});
