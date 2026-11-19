# BizMind AI — Final Round Judge Playbook & 3-Minute Demo Script

## 1. Private Judge Access (Isolated Super Admin Portal)
Per security best practices, Super Admin credentials are **never exposed on the public interface**.
- **Access Path:** Click the discrete **"Platform Admin Portal"** link in the Landing Page footer.
- **Email:** `admin@bizmind.ai`
- **Password:** `BizMind#Judge2026`
- **2FA OTP:** `246810`
- **Privacy Guarantee:** Super Admin views platform health, tenant plans, AI token spend, cache savings (34%), feature flags, and audit logs — **never** individual shop private sales or profit ledgers.

---

## 2. Exact 3-Minute Live Demo Script (Practice Verbatim)

### 0:00 – 0:30 | The Hook & Real Problem (Landing Page)
> *"Meet Rahim Bhai, a neighborhood grocery owner in Bangladesh. Every week, he loses money silently — 55 eggs are about to expire in 4 days, and ৳8,200 is stuck in unpaid Baki. BizMind AI is his retail AI partner: it cuts waste, recovers credit dues, and protects net profit."*
- Point to the **Demo Environment Banner** at the top:
  > *"In production, every user only sees their own server-verified role. For judges today, we built real role-locked Demo Accounts that reset nightly."*

### 0:30 – 1:15 | Mathematical AI & Human-in-the-Loop (Owner Login)
1. Click **Demo Login → Owner**.
2. Show the **3-Step Onboarding Checklist** & **Human-in-the-Loop Approval Queue**:
   > *"Notice BizMind AI never acts recklessly. It drafted a 15% expiry promo for those 55 eggs — and waits for Rahim Bhai's 1-click Approval."*
3. Click **Approve** → point to the **Activity Timeline** updating live.
4. Click **Open 55-Egg Optimizer** (Stock tab) and move the **Price Elasticity slider** from `0%` to `15%`:
   > *"This isn't a hardcoded 15% guess. Using price elasticity (`E = -2.4`), 0% off wastes 23 eggs and yields ৳480; 15% off lifts daily demand 36%, sells all 55 eggs, and recovers ৳701."*

### 1:15 – 1:45 | Enterprise RBAC & 404 Route Guard Proof (Cashier Login)
1. Click **Logout** → **Demo Login → Cashier**.
   > *"Notice there is no browser role switcher. Now logged in as Cashier, Profit & Loss and Billing tabs disappear completely. Stock is read-only."*
2. Click **`🛡️ Test /dashboard/profit (404)`** in the sidebar:
   > *"Even if someone hits a restricted URL directly, our server returns HTTP 404 — not 'Access Denied' — so attackers cannot even enumerate restricted routes."*

### 1:45 – 2:15 | 30-Second SaaS Business Model (Free → Premium Sandbox)
1. Log back in as **Owner** → open **AI & Trust** tab.
2. Point to the **AI Quota Meter (`18/20`)**:
   - Click the **Prompt Injection Test chip** (`19/20`) → Guardrail blocks cross-tenant attack live!
   - Ask 1 normal question (`20/20`) → ask 1 more → **Premium Lock + bKash/Nagad/SSLCommerz Sandbox Checkout** pops up!
   - Click **Complete Sandbox Upgrade** → `500/month` unlocked instantly.

### 2:15 – 2:45 | Trust, Proof, MCP & Scalability
- Point to the **25-Case Automated Evaluation Scorecard** (`25/25 passed`, `6/6 prompt injections blocked`, `94.2% retail math accuracy on our 30-day demo dataset`).
- Mention **MCP JSON-RPC Server** (`/api/v1/mcp` exposing 4 retail tools) and click **Test Telegram Bot** (`"আজ কত বিক্রি?"`).
- Mention **Credit Risk Scoring** (`0–100` score on Baki customers) and **Ctrl+K Global Search**.

### 2:45 – 3:00 | Market, Shopkeeper Validation & Roadmap
- **Market:** Millions of MSME grocery & pharmacy shops in Bangladesh; freemium entry at `৳0` → `৳499/mo` via bKash/Nagad.
- **Field Feedback (Insert Your Local Shopkeeper Quote):** Before Demo Day, show the mobile app to 1 real local shopkeeper and put their 1-sentence reaction right here!

---

## 3. One-Page Roadmap
- **Phase 1 (Live Today):** Role-locked Multi-Tenant SaaS (PostgreSQL RLS), FEFO POS, Price Elasticity Optimizer, HITL Approval Queue, Credit Risk Scoring, Guardrails, MCP Server, Telegram Bot Webhook.
- **Phase 2 (Next 60 Days):** Live bKash/Nagad Merchant API billing, Bengali WhatsApp Business API auto-reminders, offline-first IndexedDB POS sync for low-connectivity rural shops.
- **Phase 3 (6–12 Months):** Pretrained time-series forecasting (Chronos/TimesFM) benchmarked against Holt-Winters, distributor auto-procurement network across Bangladesh.
