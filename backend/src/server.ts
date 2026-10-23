import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { createPgDb } from './db';

const config = loadConfig();
const db = createPgDb();
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`MiniLedger API running on port ${config.port} (${config.nodeEnv})`);
  if (config.exposeDemoOtp) {
    console.log('[config] DEMO_OTP_IN_RESPONSE=true: OTPs are also returned to the client (dev only).');
  }
});

function shutdown() {
  server.close(() => {
    db.pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
