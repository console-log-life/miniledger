import crypto from 'node:crypto';

export type AppConfig = {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  // null means "allow any origin" (safe here: auth uses bearer tokens, not cookies).
  corsOrigins: string[] | null;
  // Development-only: include the OTP in the request-otp response so the
  // web demo can be tested without access to the server terminal.
  exposeDemoOtp: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  let jwtSecret = env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    if (isProduction) {
      throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
    }
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[config] JWT_SECRET missing or too short; using a random dev secret. Sessions reset on restart.');
  }

  const corsOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT || 3000),
    jwtSecret,
    corsOrigins: corsOrigins.length ? corsOrigins : null,
    exposeDemoOtp: !isProduction && env.DEMO_OTP_IN_RESPONSE === 'true',
  };
}
