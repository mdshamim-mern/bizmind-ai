-- ============================================================================
-- BizMind AI: Supplier Delivery Tracking, 3-Way Reconciliation & AI Audit Trail
-- ============================================================================
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS promised_delivery_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_delivery_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS po_unit_cost DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS invoice_unit_cost DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ordered_qty INTEGER,
  ADD COLUMN IF NOT EXISTS received_qty INTEGER,
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS ai_decision_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  input_snapshot JSONB NOT NULL,
  decision_output JSONB NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_basis TEXT NOT NULL,
  approved_by TEXT,
  approval_channel TEXT DEFAULT 'WEB_APP',
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_decision_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_audit_tenant_isolation ON ai_decision_audit_log;
CREATE POLICY ai_audit_tenant_isolation ON ai_decision_audit_log
  USING (shop_id = current_setting('app.current_shop_id', true));
