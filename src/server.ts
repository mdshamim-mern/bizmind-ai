import express from 'express';
import cors from 'cors';
import path from 'path';
import {
  attachSession,
  requireRoles,
  requireSuperAdmin,
  signSessionToken,
  type AuthedRequest,
  type UserRole,
} from './modules/security/rbac-route-guard';
import {
  checkGuardrails,
  optimizeExpiryDiscount,
  scoreCustomerCreditRisk,
  type ApprovalActionItem,
} from './modules/ai-agents/advanced-ai-decision.service';
import { handleMcpRpc } from './modules/mcp/bizmind-mcp-server';
import { buildTelegramReply } from './modules/bots/telegram-bot.webhook';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(attachSession);

// Serve static frontend files if present
app.use(express.static(path.join(process.cwd(), 'public')));

// In-memory demo store (nightly reset via /api/v1/cron/reset-demo when DEMO_MODE=true)
let approvalQueue: ApprovalActionItem[] = [
  {
    id: 'act_1',
    type: 'PROMO_OFFER',
    title: '55 Brown Farm Eggs — 15% Expiry Rescue Promo',
    summary: 'Price elasticity model predicts 55/55 units sold in 4 days, recovering ৳701 cash.',
    estimatedImpactBdt: 701,
    status: 'PENDING_APPROVAL',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'act_2',
    type: 'PURCHASE_ORDER',
    title: 'Reorder 28 Soybean Oil (2L) + 7 Miniket Rice (5kg)',
    summary: 'Prevents stockout before 3-day supplier lead time.',
    estimatedImpactBdt: 11200,
    status: 'PENDING_APPROVAL',
    createdAt: new Date().toISOString(),
  },
];

const DEMO_ACCOUNTS: Record<string, { userId: string; shopId: string; role: UserRole; name: string }> = {
  OWNER: { userId: 'demo_owner', shopId: 'shp_rahim_01', role: 'OWNER', name: 'Md. Rahim (Owner)' },
  MANAGER: { userId: 'demo_manager', shopId: 'shp_rahim_01', role: 'MANAGER', name: 'Kamal Hossain (Manager)' },
  CASHIER: { userId: 'demo_cashier', shopId: 'shp_rahim_01', role: 'CASHIER', name: 'Rana Mia (Cashier)' },
  STOCK_KEEPER: { userId: 'demo_stock', shopId: 'shp_rahim_01', role: 'STOCK_KEEPER', name: 'Sajib Mia (Stock Keeper)' },
};

app.get('/api/v1/public-ai/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'BizMind AI Final Round Engine',
    demoMode: process.env.DEMO_MODE !== 'false',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    mcpEndpoint: '/api/v1/mcp',
    timestamp: new Date().toISOString(),
  });
});

// Real Demo Login (issues server-signed token; Super Admin is strictly excluded from public demo signup/login)
app.post('/api/v1/auth/demo-login', (req, res) => {
  if (process.env.DEMO_MODE === 'false') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  const requested = String(req.body?.role || '').toUpperCase();
  const acct = DEMO_ACCOUNTS[requested];
  if (!acct) {
    res.status(400).json({ error: 'Invalid demo role. Use OWNER, MANAGER, CASHIER, or STOCK_KEEPER.' });
    return;
  }
  const token = signSessionToken({ ...acct, plan: 'FREE', isDemo: true }, 60 * 60 * 6);
  res.json({ token, user: acct, plan: 'FREE', isDemo: true });
});

// Dedicated Super Admin Login with 2FA OTP & short 15-minute token TTL
app.post('/api/v1/auth/admin-login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const otp = String(req.body?.otp || '').trim();

  const validEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@bizmind.ai').toLowerCase();
  const validPass = process.env.SUPER_ADMIN_PASSWORD || 'BizMind#Judge2026';
  const validOtp = process.env.SUPER_ADMIN_DEMO_OTP || '246810';

  if (email !== validEmail || password !== validPass || otp !== validOtp) {
    res.status(401).json({ error: 'Invalid admin credentials or 2FA code.' });
    return;
  }

  const token = signSessionToken(
    { userId: 'sa_01', shopId: null, role: 'SUPER_ADMIN', name: 'Platform Super Admin', plan: 'PREMIUM', isDemo: true },
    60 * 15
  );
  res.json({ token, expiresInSeconds: 900, role: 'SUPER_ADMIN' });
});

// Strict RBAC-protected Profit & Loss (Owner & Manager only; Cashier/Stock Keeper/Super Admin receive 404)
app.get('/api/v1/shop/profit-summary', requireRoles(['OWNER', 'MANAGER']), (req: AuthedRequest, res) => {
  res.json({
    shopId: req.session?.shopId,
    revenueBdt: 107900,
    grossProfitBdt: 8800,
    inventoryLossBdt: 50,
    netProfitBdt: 4550,
  });
});

// Strict Super Admin Platform Metrics (never includes private shop sales; non-admins receive 404)
app.get('/api/v1/admin/platform-overview', requireSuperAdmin, (_req, res) => {
  res.json({
    totalShops: 4,
    dailyActiveUsers: 1284,
    churnRatePct: 2.1,
    monthlyAiSpendUsd: 14.82,
    cacheSavingsPct: 34,
    avgApiLatencyMs: 184,
    dbHealthPct: 99.98,
  });
});

// Mathematical Price Elasticity Discount Optimization
app.post('/api/v1/ai/optimize-discount', (req, res) => {
  const result = optimizeExpiryDiscount({
    productName: String(req.body?.productName || 'Brown Farm Eggs'),
    stock: Number(req.body?.stock ?? 55),
    unitCost: Number(req.body?.unitCost ?? 10),
    sellingPrice: Number(req.body?.sellingPrice ?? 15),
    daysToExpiry: Number(req.body?.daysToExpiry ?? 4),
    baselineDailySales: Number(req.body?.baselineDailySales ?? 8),
    priceElasticity: req.body?.priceElasticity ? Number(req.body.priceElasticity) : 2.4,
  });
  res.json(result);
});

// Customer Credit Risk Scoring
app.post('/api/v1/ai/credit-risk', (req, res) => {
  const result = scoreCustomerCreditRisk({
    id: String(req.body?.id || 'c1'),
    name: String(req.body?.name || 'Karim Mia'),
    dueAmount: Number(req.body?.dueAmount ?? 3450),
    overdueDays: Number(req.body?.overdueDays ?? 18),
    totalLifetimeCredit: Number(req.body?.totalLifetimeCredit ?? 8000),
    onTimePaymentRate: Number(req.body?.onTimePaymentRate ?? 0.55),
  });
  res.json(result);
});

// Human-in-the-Loop Approval Queue
app.get('/api/v1/ai/approvals', (_req, res) => {
  res.json({ items: approvalQueue });
});

app.post('/api/v1/ai/approvals/:id/decide', requireRoles(['OWNER', 'MANAGER']), (req: AuthedRequest, res) => {
  const item = approvalQueue.find((x) => x.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  const decision = String(req.body?.decision || '').toUpperCase();
  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
    return;
  }
  item.status = decision;
  item.decidedBy = req.session?.name || 'Owner';
  res.json({ item });
});

// MCP Server JSON-RPC 2.0 Endpoint
app.post('/api/v1/mcp', (req, res) => {
  const rpc = req.body;
  if (!rpc || rpc.jsonrpc !== '2.0' || !rpc.method) {
    res.status(400).json({ jsonrpc: '2.0', id: rpc?.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC request' } });
    return;
  }
  res.json(handleMcpRpc(rpc));
});

// Telegram Bot Webhook
app.post('/api/v1/bots/telegram/webhook', (req, res) => {
  const text = req.body?.message?.text || '';
  const reply = buildTelegramReply(text);
  res.json({ ok: true, reply });
});

// Live Gemini + Guardrails Chat Endpoint
app.post('/api/v1/public-ai/chat', async (req, res) => {
  const started = Date.now();
  const message = String(req.body?.message || '').trim();
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  if (!message) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  const guard = checkGuardrails(message);
  if (!guard.safe) {
    res.json({
      answer:
        lang === 'bn'
          ? '🛡️ নিরাপত্তা গার্ডরেইল: অন্য দোকানের ডেটা, সিস্টেম প্রম্পট বা অননুমোদিত রোল পরিবর্তনের অনুরোধ ব্লক করা হয়েছে।'
          : '🛡️ Security Guardrail: Cross-tenant data access, system prompt extraction, or role escalation requests are strictly blocked.',
      provider: 'BizMind Guardrails',
      blocked: true,
      latencyMs: Date.now() - started,
    });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const sys =
        lang === 'bn'
          ? 'You are BizMind AI, a practical retail co-pilot for Bangladeshi shopkeepers. Answer in clear, pure Bengali. If data is missing for a specific shop metric, honestly say you do not have enough data instead of guessing.'
          : 'You are BizMind AI, a practical retail co-pilot for Bangladeshi shopkeepers. Answer in clear English. If data is missing, honestly state it instead of guessing.';
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ role: 'user', parts: [{ text: `${message}\n\nShop Context: ${JSON.stringify(req.body?.shopContext || {})}` }] }],
            tools: [{ googleSearch: {} }],
          }),
        }
      );
      if (resp.ok) {
        const data: any = await resp.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n');
        if (text) {
          res.json({ answer: text, provider: 'Gemini 2.5 Flash + Google Search', latencyMs: Date.now() - started });
          return;
        }
      }
    } catch {
      // Fallback to deterministic local reply below
    }
  }

  res.json({
    answer: buildTelegramReply(message),
    provider: 'BizMind Verified Local Engine',
    latencyMs: Date.now() - started,
  });
});

// Nightly Demo Data Reset Cron
app.post('/api/v1/cron/reset-demo', (_req, res) => {
  if (process.env.DEMO_MODE === 'false') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  approvalQueue = approvalQueue.map((item) => ({ ...item, status: 'PENDING_APPROVAL', decidedBy: undefined }));
  res.json({ ok: true, message: 'Demo environment reset completed.' });
});

export default app;
