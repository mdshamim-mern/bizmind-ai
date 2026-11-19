# BizMind AI — One-Page Scalability & Multi-Tenant Architecture Brief

## 1. System Architecture Diagram

```text
[Mobile / PWA / Desktop Shopkeepers (100+ Concurrent Shops)]
  ├── Offline-First POS Queue (Local Persistence + Idempotency Keys)
  ├── Hind Siliguri Bangla/English UI · Ctrl+K Command Palette · 58mm Thermal Print
  └── Real-Time Stock Sync (SSE) & Bangla Voice Assistant
                    │
                    ▼
[Vercel Edge & Serverless API Layer (src/server.ts)]
  ├── Security: Sliding-Window Rate Limit · RBAC (Owner/Manager/Cashier) · SMS OTP
  ├── Cost Control: Per-Shop AI Quota · Response Cache (Upstash Redis Ready) · Model Router
  └── Multi-Agent AI Engine (Inventory · Sales · Finance · Supplier · Manager)
        ├── Read-Only Tenant-Scoped Tools + RAG Knowledge Retrieval
        ├── Gemini 2.5 Flash-Lite (Simple Queries) / Gemini 2.5 Flash + Google Search (Live Market)
        └── SSE Word-by-Word Streaming & Prompt Injection Guardrail
                    │
                    ▼
[PostgreSQL via Connection Pooler (Neon / Supabase / Prisma Accelerate)]
  ├── Hard Isolation: PostgreSQL Row-Level Security (RLS) on shop_id
  ├── Fast Analytics: Composite Indexes (shopId, createdAt) + DailySalesSummary Table
  └── Auditability: Immutable AuditLog + IdempotencyKey + Point-in-Time Recovery (PITR)
                    │
                    ▼
[Automated Background Jobs (Vercel Cron)]
  └── Daily 8:00 AM BDT (/api/v1/cron/morning-brief): Morning Brief, Forecasts & Expiry Alerts
```

## 2. How BizMind AI Scales Safely to 1,000+ Bangladeshi Shops

1. **Zero Connection Exhaustion:** Serverless endpoints connect through a transaction pooler (Neon/Supabase Pooler) and read pre-aggregated `daily_sales_summaries` instead of scanning raw `SaleItem` rows on every dashboard open.
2. **Defense-in-Depth Multi-Tenant Isolation:** Every query is filtered by JWT `shopId` at the API layer AND enforced at the database engine level via PostgreSQL Row-Level Security (`prisma/rls-and-indexes.sql`), verified in CI by `tests/isolation-and-enterprise.test.ts`.
3. **Accounting Accuracy Under Concurrency:** Every POS sale uses transactional batch deduction with `X-Idempotency-Key` protection so unstable 3G/4G connections in rural Bangladesh never double-bill a customer or push stock negative.
4. **Predictable AI Unit Economics:** Identical queries hit a 5-minute TTL cache (`getCachedAIResponse`), simple greetings route to `gemini-2.5-flash-lite`, live market/forecast queries route to `gemini-2.5-flash` with Google Search, and every shop tracks a monthly quota (`FREE`: 50/mo, `PRO`: 1,000/mo).
5. **Verified Load & CI Benchmarks:** Automated GitHub Actions CI runs `tests/ai-evaluation.test.ts` and `tests/isolation-and-enterprise.test.ts` on every push, accompanied by `tests/load-test-k6.js` validating `p95 < 300ms` under 100 concurrent shops.
