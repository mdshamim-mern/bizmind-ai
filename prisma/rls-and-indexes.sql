-- ============================================================================
-- BizMind AI - Enterprise PostgreSQL Row-Level Security (RLS),
-- Composite Performance Indexes, Daily Summary Table & Idempotency Constraints
-- Compatible with Neon, Supabase Pooler, and Prisma Accelerate
-- ============================================================================

-- 1. Composite Indexes for High-Concurrency Multi-Tenant Queries (shopId + createdAt)
CREATE INDEX IF NOT EXISTS idx_sales_shop_created ON "Sale" ("shopId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_date ON "Expense" ("shopId", "date" DESC);
CREATE INDEX IF NOT EXISTS idx_batches_shop_expiry ON "InventoryBatch" ("shopId", "expiryDate" ASC);
CREATE INDEX IF NOT EXISTS idx_adjustments_shop_created ON "StockAdjustment" ("shopId", "createdAt" DESC);

-- 2. Pre-Aggregated Daily Sales Summary Table (Instant Dashboard Loading)
CREATE TABLE IF NOT EXISTS daily_sales_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  summary_date DATE NOT NULL,
  total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_cogs NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  operating_expenses NUMERIC(12, 2) NOT NULL DEFAULT 0,
  inventory_losses NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  units_sold INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, summary_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_summary_shop_date ON daily_sales_summaries (shop_id, summary_date DESC);

-- 3. Audit Log Table (Tracks who changed what across Owner, Manager, Cashier)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_created ON audit_logs (shop_id, created_at DESC);

-- 4. Idempotency Keys Table (Prevents duplicate sales during poor mobile internet)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PostgreSQL Row-Level Security (RLS) for Hard Multi-Tenant Isolation
-- Even if application code has a bug, Shop A can NEVER read Shop B's rows.
ALTER TABLE daily_sales_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_daily_summary_isolation ON daily_sales_summaries;
CREATE POLICY rls_daily_summary_isolation ON daily_sales_summaries
  USING (shop_id = current_setting('app.current_shop_id', true));

DROP POLICY IF EXISTS rls_audit_logs_isolation ON audit_logs;
CREATE POLICY rls_audit_logs_isolation ON audit_logs
  USING (shop_id = current_setting('app.current_shop_id', true));
