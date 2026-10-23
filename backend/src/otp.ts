import crypto from 'node:crypto';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

type OtpEntry = {
  hash: string;
  expiresAt: number;
  attemptsLeft: number;
  sentAt: number;
};

export type IssueResult =
  | { ok: true; otp: string; expiresInSeconds: number }
  | { ok: false; retryAfterSeconds: number };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'locked' }
  | { ok: false; reason: 'mismatch'; attemptsLeft: number };

const hashOtp = (otp: string) => crypto.createHash('sha256').update(otp).digest('hex');

// In-memory OTP store. Codes are single-use, expire, and lock after too many
// wrong attempts. Suitable for a single API instance; use Redis or the
// database if the API is scaled horizontally.
export class OtpService {
  private entries = new Map<string, OtpEntry>();

  constructor(private now: () => number = Date.now) {}

  issue(phone: string): IssueResult {
    const now = this.now();
    this.sweep(now);

    const existing = this.entries.get(phone);
    if (existing && now - existing.sentAt < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - existing.sentAt)) / 1000),
      };
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    this.entries.set(phone, {
      hash: hashOtp(otp),
      expiresAt: now + OTP_TTL_MS,
      attemptsLeft: OTP_MAX_ATTEMPTS,
      sentAt: now,
    });
    return { ok: true, otp, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  verify(phone: string, otp: string): VerifyResult {
    const entry = this.entries.get(phone);
    if (!entry) return { ok: false, reason: 'missing' };

    if (this.now() > entry.expiresAt) {
      this.entries.delete(phone);
      return { ok: false, reason: 'expired' };
    }

    const matches = crypto.timingSafeEqual(Buffer.from(entry.hash), Buffer.from(hashOtp(otp)));
    if (matches) {
      this.entries.delete(phone);
      return { ok: true };
    }

    entry.attemptsLeft -= 1;
    if (entry.attemptsLeft <= 0) {
      this.entries.delete(phone);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'mismatch', attemptsLeft: entry.attemptsLeft };
  }

  private sweep(now: number) {
    for (const [phone, entry] of this.entries) {
      if (now > entry.expiresAt) this.entries.delete(phone);
    }
  }
}
