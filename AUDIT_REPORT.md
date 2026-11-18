# BizMind AI — Technical & AI Security Audit Report

**Repository:** `mdshamim-mern/bizmind-ai` (`main` branch)  
**Audit Date:** 2026-11-19  
**Scope:** Backend architecture, multi-tenant data isolation, AI engine capabilities, and API security posture.

---

## 1. Architecture & Tech Stack

BizMind AI is a multi-shop retail/grocery business management, inventory, accounting, and AI decision-support backend built with a modular monolith pattern.

| Layer | Technology / Pattern | Details |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js + TypeScript (`^5.6.3`) | Strict TypeScript (`@types/node ^22.7.5`) |
| **Web Framework** | Express (`^4.21.0`) | Modular routers mounted under `/api/v1/*` (`auth`, `inventory`, `accounting`, `ai`) + static `/dashboard` (`public/index.html`) |
| **Database & ORM** | PostgreSQL + Prisma (`^5.20.0`) | Multi-tenant relational schema (`Shop`, `User`, `Category`, `Supplier`, `Product`, `InventoryBatch`, `Purchase`, `Sale`, `Expense`, `StockAdjustment`, `DemandForecast`, `AIRecommendation`, `BusinessReport`) |
| **Authentication** | JWT (`jsonwebtoken ^9.0.2`) + `bcryptjs` | Bearer token verification via `authenticateShop` (`src/middlewares/auth.middleware.ts`) injecting `req.user` (`userId`, `shopId`, `role`) |
| **Tenant Isolation** | Application-level `shopId` scoping | Every business query and AI computation filters strictly by `shopId` from the verified JWT payload |
| **AI Engine** | Hybrid Deterministic + Gemini LLM (`gemini-2.5-flash`) | Read-only tool-calling assistant with deterministic local fallback when `GEMINI_API_KEY` is absent |

---

## 2. Feature & AI Module Audit Status

| Module / Feature | Endpoint / Service | Status | Audit Notes |
| :--- | :--- | :--- | :--- |
| **Auth & Multi-Tenant JWT** | `src/modules/auth/*`, `auth.middleware.ts` | Operational (Hardening Needed) | `authenticateShop` enforces `shopId` on protected routes; hardcoded `JWT_SECRET` fallback must be removed in production. |
| **Inventory & Batch FEFO** | `src/modules/inventory/*` | Operational | Tracks `InventoryBatch` (`quantityRemaining`, `expiryDate`, `costPrice`) enabling expiry-aware analytics. |
| **Accounting & POS** | `src/modules/accounting/*` | Operational | Tracks `Sale`, `Purchase`, `Expense`, and `StockAdjustment` scoped to `shopId`. |
| **Core AI Analytics** | `/product-performance`, `/demand-forecast`, `/restock-advisor`, `/discount-advisor`, `/dashboard` | Operational | Provides period-based product performance, reorder suggestions, discount recommendations, and dashboard summaries. |
| **LLM Business Assistant** | `POST /api/v1/ai/assistant/chat` (`askBusinessAssistant`) | Upgraded / Ready | Supports `GEMINI_API_KEY` (`gemini-2.5-flash`) + read-only tool-calling fallback returning bilingual (BN/EN) answers and `chart` data. |
| **Waste Rescue AI** | `GET /api/v1/ai/waste-rescue` (`getWasteRescuePlan`) | Upgraded / Ready | Calculates days-to-expiry, 10%/15% discount recovery (`cashRecoveredBDT`), Bangla action headlines, `banglaOfferPost`, and `whyExplanation`. |
| **Baki Khata & Reminders** | `GET/POST /api/v1/ai/baki-khata` (`getBakiLedgerAndReminders`, `addOrUpdateBakiEntry`) | Upgraded / Ready | Tracks customer credit, ranks `collectionPriority`, and generates `politeBanglaReminder` messages. |
| **Supplier Chalan Scanner** | `POST /api/v1/ai/chalan-scanner` (`scanSupplierChalan`) | Upgraded / Ready | Extracts product name, quantity, and purchase price from chalan image/text for stock entry preparation. |
| **Festival Demand Forecast** | `generateDemandForecasts` | Upgraded / Ready | 7/15/30-day forecasts with Bangladesh seasonality (`RAMADAN_EID`, `POHELA_BOISHAKH`, `MONSOON_RAIN`) and `"ডেটা অপর্যাপ্ত"` guardrail. |
| **Health Score & Anomalies** | `GET /api/v1/ai/health-score` (`getBusinessHealthAndAnomalies`) | Upgraded / Ready | 0–100 score across 5 categories plus `MARGIN_LEAK` anomaly alerts when purchase cost rises. |
| **What-If Simulator & Briefs** | `POST /api/v1/ai/what-if-simulator` (`runWhatIfSimulation`) | Upgraded / Ready | Simulates pricing/discount/stock scenarios alongside Morning Brief ("আজকের ৩টি কাজ"), Smart Combo Offers, and Impact Summary. |

---

## 3. Security Audit Report

### 3.1 Critical & High Findings
1. **Hardcoded JWT Secret Fallback (`HIGH`)**
   - **Location:** `src/middlewares/auth.middleware.ts` (`const JWT_SECRET = process.env.JWT_SECRET || 'bizmind-ai-secret-key';`)
   - **Risk:** If `JWT_SECRET` is unset in deployment, attackers can forge valid JWTs for any `shopId` and `role`.
   - **Remediation:** Fail fast at startup if `process.env.JWT_SECRET` is missing; enforce a 256-bit cryptographically random secret.

2. **Unrestricted CORS & Missing Payload Limits (`MEDIUM`)**
   - **Location:** `src/app.ts` (`app.use(cors()); app.use(express.json());`)
   - **Risk:** Any origin can make credentialed/browser requests, and large JSON/image payloads (e.g., base64 chalan scans) could cause memory exhaustion.
   - **Remediation:** Configure an explicit `CORS_ORIGIN` allowlist, set `express.json({ limit: '5mb' })`, add `helmet`, and apply `express-rate-limit` on `/api/v1/auth` and `/api/v1/ai`.

### 3.2 Multi-Tenant & AI Security Controls
- **Tenant (`shopId`) Isolation:** All AI routes sit behind `router.use(authenticateShop)` in `src/modules/ai-engine/ai.routes.ts`. Services accept `shopId` exclusively from `req.user!.shopId` (never from `req.body` or `req.query`), preventing cross-tenant data leakage.
- **Read-Only LLM Tool Calling:** `askBusinessAssistant` only exposes read-only shop aggregation tools scoped by `shopId`; the LLM cannot execute arbitrary SQL, mutate inventory/sales, or access other tenants.
- **Data Sufficiency Guardrail:** `generateDemandForecasts` enforces a minimum historical data threshold and returns `"ডেটা অপর্যাপ্ত"` instead of hallucinating demand spikes.
- **Secret Hygiene:** `GEMINI_API_KEY` is read strictly from `process.env.GEMINI_API_KEY` on the server and never exposed in API responses or client bundles.
