import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config';
import type { Db } from '../src/db';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, OtpService } from '../src/otp';

const config: AppConfig = {
  nodeEnv: 'test',
  isProduction: false,
  port: 0,
  jwtSecret: 'test-secret-that-is-at-least-32-characters',
  corsOrigins: null,
  exposeDemoOtp: true,
};

let pg: PGlite;
let server: Server;
let baseUrl: string;
let clock = Date.now();
let otp: OtpService;

const db: Db = {
  async query<T>(text: string, params: unknown[] = []) {
    const result = await pg.query<T>(text, params);
    // Match pg's rowCount: rows returned for SELECT, rows affected otherwise.
    return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
  },
};

async function api(method: string, url: string, body?: unknown, token?: string) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(phone: string) {
  clock += OTP_RESEND_COOLDOWN_MS; // avoid the resend cooldown between tests
  const requested = await api('POST', '/api/auth/request-otp', { phone });
  assert.equal(requested.status, 200);
  const verified = await api('POST', '/api/auth/verify-otp', { phone, otp: requested.body.devOtp });
  assert.equal(verified.status, 200);
  return verified.body.token as string;
}

before(async () => {
  pg = new PGlite();
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pg.exec(schema);
  await pg.exec(schema); // migrations must be idempotent

  otp = new OtpService(() => clock);
  const app = createApp({ db, config, otp });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('DELETE FROM loans; DELETE FROM users;');
});

describe('health', () => {
  test('reports database connectivity', async () => {
    const res = await api('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok', database: 'connected' });
  });

  test('reports 503 when the database is unreachable', async () => {
    const broken: Db = { query: async () => { throw new Error('down'); } };
    const app = createApp({ db: broken, config });
    const s = app.listen(0);
    await new Promise((resolve) => s.once('listening', resolve));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/health`);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).database, 'unreachable');
    await new Promise((resolve) => s.close(resolve));
  });
});

describe('OTP auth', () => {
  test('rejects invalid phone numbers', async () => {
    for (const phone of ['', '123', 'abcdefghijk', '+1234567890123456']) {
      const res = await api('POST', '/api/auth/request-otp', { phone });
      assert.equal(res.status, 400, phone);
      assert.match(res.body.error, /valid phone/);
    }
  });

  test('sends CORS headers for browser clients', async () => {
    const res = await fetch(baseUrl + '/api/auth/request-otp', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  });

  test('full login: request, verify, create user, /me', async () => {
    clock += OTP_RESEND_COOLDOWN_MS;
    const requested = await api('POST', '/api/auth/request-otp', { phone: '+91 98765-43210' });
    assert.equal(requested.status, 200);
    assert.equal(requested.body.phone, '+919876543210');
    assert.match(requested.body.devOtp, /^[0-9]{6}$/);

    const verified = await api('POST', '/api/auth/verify-otp', {
      phone: '+919876543210',
      otp: requested.body.devOtp,
    });
    assert.equal(verified.status, 200);
    assert.ok(verified.body.token);
    assert.equal(verified.body.user.phone, '+919876543210');

    const me = await api('GET', '/api/auth/me', undefined, verified.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, verified.body.user.id);

    const users = await pg.query('SELECT phone FROM users');
    assert.equal(users.rows.length, 1);
  });

  test('OTP is single-use', async () => {
    clock += OTP_RESEND_COOLDOWN_MS;
    const { body } = await api('POST', '/api/auth/request-otp', { phone: '9876543210' });
    const first = await api('POST', '/api/auth/verify-otp', { phone: '9876543210', otp: body.devOtp });
    assert.equal(first.status, 200);
    const reused = await api('POST', '/api/auth/verify-otp', { phone: '9876543210', otp: body.devOtp });
    assert.equal(reused.status, 401);
    assert.match(reused.body.error, /No active OTP/);
  });

  test('OTP expires', async () => {
    clock += OTP_RESEND_COOLDOWN_MS;
    const { body } = await api('POST', '/api/auth/request-otp', { phone: '9876543211' });
    clock += OTP_TTL_MS + 1;
    const res = await api('POST', '/api/auth/verify-otp', { phone: '9876543211', otp: body.devOtp });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /expired/);
  });

  test('wrong OTPs count down and then lock', async () => {
    clock += OTP_RESEND_COOLDOWN_MS;
    const { body } = await api('POST', '/api/auth/request-otp', { phone: '9876543212' });
    const wrong = body.devOtp === '000000' ? '111111' : '000000';
    for (let left = OTP_MAX_ATTEMPTS - 1; left > 0; left--) {
      const res = await api('POST', '/api/auth/verify-otp', { phone: '9876543212', otp: wrong });
      assert.equal(res.status, 401);
      assert.match(res.body.error, new RegExp(`${left} attempts? left`));
    }
    const locked = await api('POST', '/api/auth/verify-otp', { phone: '9876543212', otp: wrong });
    assert.equal(locked.status, 429);
    const correctAfterLock = await api('POST', '/api/auth/verify-otp', { phone: '9876543212', otp: body.devOtp });
    assert.equal(correctAfterLock.status, 401);
  });

  test('resend is rate limited', async () => {
    clock += OTP_RESEND_COOLDOWN_MS;
    assert.equal((await api('POST', '/api/auth/request-otp', { phone: '9876543213' })).status, 200);
    const again = await api('POST', '/api/auth/request-otp', { phone: '9876543213' });
    assert.equal(again.status, 429);
    assert.ok(again.body.retryAfterSeconds > 0);
  });

  test('devOtp is never returned in production config', async () => {
    const app = createApp({ db, config: { ...config, isProduction: true, exposeDemoOtp: false } });
    const s = app.listen(0);
    await new Promise((resolve) => s.once('listening', resolve));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543214' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.devOtp, undefined);
    await new Promise((resolve) => s.close(resolve));
  });

  test('rejects missing, malformed and forged tokens', async () => {
    assert.equal((await api('GET', '/api/loans')).status, 401);
    assert.equal((await api('GET', '/api/loans', undefined, 'garbage')).status, 401);
    const jwt = await import('jsonwebtoken');
    const forged = jwt.default.sign({ phone: 'x' }, 'wrong-secret', { subject: '1' });
    assert.equal((await api('GET', '/api/summary', undefined, forged)).status, 401);
  });
});

describe('loans', () => {
  test('create, list, repay, summary, delete', async () => {
    const token = await login('9000000001');

    const empty = await api('GET', '/api/loans', undefined, token);
    assert.deepEqual(empty.body, []);
    const emptySummary = await api('GET', '/api/summary', undefined, token);
    assert.deepEqual(emptySummary.body, {
      totalLent: 0, totalRepaid: 0, outstandingAmount: 0, overdueAmount: 0, loanCount: 0,
    });

    const overdue = await api('POST', '/api/loans', { friendName: '  Aarav  ', amount: 1500.5, dueDate: '2020-01-15' }, token);
    assert.equal(overdue.status, 201);
    assert.equal(overdue.body.friendName, 'Aarav');
    assert.equal(overdue.body.amount, 1500.5);
    assert.equal(overdue.body.dueDate, '2020-01-15'); // no timezone shift
    assert.equal(overdue.body.repaid, false);

    const future = await api('POST', '/api/loans', { friendName: 'Diya', amount: '250', dueDate: '2099-12-31' }, token);
    assert.equal(future.status, 201);
    const toRepay = await api('POST', '/api/loans', { friendName: 'Kabir', amount: 100, dueDate: '2099-01-01' }, token);

    const repaid = await api('PATCH', `/api/loans/${toRepay.body.id}/repay`, undefined, token);
    assert.equal(repaid.status, 200);
    assert.equal(repaid.body.repaid, true);
    assert.ok(repaid.body.repaidAt);
    const repaidAgain = await api('PATCH', `/api/loans/${toRepay.body.id}/repay`, undefined, token);
    assert.equal(repaidAgain.status, 409);

    const list = await api('GET', '/api/loans', undefined, token);
    assert.equal(list.body.length, 3);
    assert.equal(list.body[2].id, toRepay.body.id); // repaid loans sort last

    const summary = await api('GET', '/api/summary', undefined, token);
    assert.deepEqual(summary.body, {
      totalLent: 1850.5, totalRepaid: 100, outstandingAmount: 1750.5, overdueAmount: 1500.5, loanCount: 3,
    });

    assert.equal((await api('DELETE', `/api/loans/${future.body.id}`, undefined, token)).status, 204);
    assert.equal((await api('DELETE', `/api/loans/${future.body.id}`, undefined, token)).status, 404);
    const persisted = await pg.query('SELECT friend_name FROM loans ORDER BY id');
    assert.deepEqual(persisted.rows.map((r: any) => r.friend_name), ['Aarav', 'Kabir']);
  });

  test('validates loan input', async () => {
    const token = await login('9000000002');
    const bad = [
      {},
      { friendName: '', amount: 10, dueDate: '2026-01-01' },
      { friendName: 'A'.repeat(121), amount: 10, dueDate: '2026-01-01' },
      { friendName: 'A', amount: 0, dueDate: '2026-01-01' },
      { friendName: 'A', amount: -5, dueDate: '2026-01-01' },
      { friendName: 'A', amount: 10.123, dueDate: '2026-01-01' },
      { friendName: 'A', amount: 1e11, dueDate: '2026-01-01' },
      { friendName: 'A', amount: 'abc', dueDate: '2026-01-01' },
      { friendName: 'A', amount: 10, dueDate: '2026-02-30' },
      { friendName: 'A', amount: 10, dueDate: '15/11/2026' },
    ];
    for (const body of bad) {
      const res = await api('POST', '/api/loans', body, token);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal((await pg.query('SELECT 1 FROM loans')).rows.length, 0);

    assert.equal((await api('POST', '/api/loans', '{not json', token)).status, 400);
    assert.equal((await api('PATCH', '/api/loans/abc/repay', undefined, token)).status, 400);
    assert.equal((await api('DELETE', '/api/loans/0', undefined, token)).status, 400);
  });

  test("users cannot see or modify each other's loans", async () => {
    const alice = await login('9000000003');
    const bob = await login('9000000004');
    const loan = await api('POST', '/api/loans', { friendName: 'Secret', amount: 999, dueDate: '2030-01-01' }, alice);

    assert.deepEqual((await api('GET', '/api/loans', undefined, bob)).body, []);
    assert.equal((await api('GET', '/api/summary', undefined, bob)).body.totalLent, 0);
    assert.equal((await api('PATCH', `/api/loans/${loan.body.id}/repay`, undefined, bob)).status, 404);
    assert.equal((await api('DELETE', `/api/loans/${loan.body.id}`, undefined, bob)).status, 404);
    assert.equal((await api('GET', '/api/loans', undefined, alice)).body.length, 1);
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await api('GET', '/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Not found');
  });
});
