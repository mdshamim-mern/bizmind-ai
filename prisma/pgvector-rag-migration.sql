-- ============================================================================
-- BizMind AI: pgvector RAG Schema (Documents, Supplier Terms & Past Advice ONLY)
-- Financial & accounting totals ALWAYS use deterministic SQL queries, NEVER RAG.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('SUPPLIER_POLICY', 'PAST_ADVICE', 'BUSINESS_REPORT', 'SOP')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant isolation via PostgreSQL Row-Level Security
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_tenant_isolation ON knowledge_embeddings;
CREATE POLICY knowledge_tenant_isolation ON knowledge_embeddings
  USING (shop_id = current_setting('app.current_shop_id', true));

-- Fast cosine similarity index for semantic retrieval
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_shop_vec
  ON knowledge_embeddings USING hnsw (embedding vector_cosine_ops);
