-- Idempotent, non-destructive schema. Safe to run repeatedly (npm run db:migrate).

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(16) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  friend_name VARCHAR(120) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  repaid BOOLEAN NOT NULL DEFAULT FALSE,
  repaid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Loans belong to the user who created them. Nullable so that rows created
-- before authentication existed are kept (they are simply not shown to anyone).
ALTER TABLE loans ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS loans_user_due_idx ON loans (user_id, due_date);
