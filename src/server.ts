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
} from './modules/ai-agents/advanced-ai-decision.service';
import { runSixAgentStateGraph } from './modules/ai-agents/langgraph-multi-agent';
import { run90DayBacktest } from './modules/ai-agents/backtest-90day.engine';
import { runDigitalTwinSimulation } from './modules/ai-agents/digital-twin.service';
import { handleMcpRpc } from './modules/mcp/bizmind-mcp-server';
import { buildTelegramReply } from './modules/bots/telegram-bot.webhook';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(attachSession);
app.use(express.static(path.join(process.cwd(), 'public')));

const DEMO_ACCOUNTS: Record<string, { userId: string; shopId: string; role: UserRole; name: string }> = {
  OWNER: { userId: 'demo_owner', shopId: 'shp_rahim_01', role: 'OWNER', name: 'Md. Rahim (Owner)' },
  MANAGER: { userId: 'demo_manager', shopId: 'shp_rahim_01', role: 'MANAGER', name: 'Kamal Hossain (Manager)' },
  CASHIER: { userId: 'demo_cashier', shopId: 'shp_rahim_01', role: 'CASHIER', name: 'Rana Mia (Cashier)' },
  STOCK_KEEPER: { userId: 'demo_stock', shopId: 'shp_rahim_01', role: 'STOCK_KEEPER', name: 'Sajib Mia (Stock Keeper)' },
};

const supplierSandboxLog: Array<{ poNumber: string; to: string; approvedBy: string; sentAt: string }> = [];

app.get('/api/v1/public-ai/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'BizMind AI Part-1 Winning Signals Engine',
    agents: ['Router', 'Inventory', 'Sales', 'Finance', 'Supplier', 'Manager'],
    backtestEndpoint: '/api/v1/ai/backtest-90d',
    digitalTwinEndpoint: '/api/v1/ai/digital-twin',
    mcpEndpoint: '/api/v1/mcp',
  });
});

app.post('/api/v1/auth/demo-login', (req, res) => {
  if (process.env.DEMO_MODE === 'false') { res.status(404).json({ error: 'Not Found' }); return; }
  const acct = DEMO_ACCOUNTS[String(req.body?.role || '').toUpperCase()];
  if (!acct) { res.status(400).json({ error: 'Invalid role' }); return; }
  const token = signSessionToken({ ...acct, plan: 'FREE', isDemo: true }, 60 * 60 * 6);
  res.json({ token, user: acct, plan: 'FREE', isDemo: true });
});

app.post('/api/v1/auth/admin-login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const otp = String(req.body?.otp || '').trim();
  if (
    email !== (process.env.SUPER_ADMIN_EMAIL || 'admin@bizmind.ai').toLowerCase() ||
    password !== (process.env.SUPER_ADMIN_PASSWORD || 'BizMind#Judge2026') ||
    otp !== (process.env.SUPER_ADMIN_DEMO_OTP || '246810')
  ) {
    res.status(401).json({ error: 'Invalid admin credentials or 2FA OTP' });
    return;
  }
  const token = signSessionToken({ userId: 'sa_01', shopId: null, role: 'SUPER_ADMIN', name: 'Super Admin', plan: 'PREMIUM', isDemo: true }, 900);
  res.json({ token, expiresInSeconds: 900, role: 'SUPER_ADMIN' });
});

app.get('/api/v1/shop/profit-summary', requireRoles(['OWNER', 'MANAGER']), (req: AuthedRequest, res) => {
  res.json({ shopId: req.session?.shopId, revenueBdt: 107900, grossProfitBdt: 8800, inventoryLossBdt: 50, netProfitBdt: 4550 });
});

app.get('/api/v1/admin/platform-overview', requireSuperAdmin, (_req, res) => {
  res.json({ totalShops: 4, dailyActiveUsers: 1284, churnRatePct: 2.1, monthlyAiSpendUsd: 14.82, cacheSavingsPct: 34 });
});

// 1. 6-Agent StateGraph + Live Trace + Safe Generative UI JSON
app.post('/api/v1/ai/multi-agent-trace', (req, res) => {
  const message = String(req.body?.message || 'আজকের দোকানের অবস্থা ও সাপ্লায়ার অর্ডার বলো');
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  const guard = checkGuardrails(message);
  if (!guard.safe) {
    res.json({ blocked: true, answer: guard.reason, trace: [], generativeUi: [] });
    return;
  }
  res.json(runSixAgentStateGraph(message, lang));
});

// 2. 90-Day Backtest Proof ("Revenue up, stockouts down")
app.get('/api/v1/ai/backtest-90d', (_req, res) => {
  res.json(run90DayBacktest());
});

// 3. Digital Twin "What-If" Simulator
app.post('/api/v1/ai/digital-twin', (req, res) => {
  res.json(
    runDigitalTwinSimulation({
      rainyDays: Number(req.body?.rainyDays ?? 3),
      sugarPriceChangePct: Number(req.body?.sugarPriceChangePct ?? 10),
      eidStockBoostPct: Number(req.body?.eidStockBoostPct ?? 50),
    })
  );
});

// 4. Automated Supplier Reorder -> Owner Approval -> Sandbox Email Webhook
app.post('/api/v1/supplier/approve-po-sandbox', (req: AuthedRequest, res) => {
  const poNumber = String(req.body?.poNumber || 'PO-2026-884');
  const recipientEmail = 'sandbox-supplier@bizmind.ai'; // Strictly Sandbox in Demo!
  const approvedBy = req.session?.name || String(req.body?.approvedBy || 'Shop Owner');
  const entry = { poNumber, to: recipientEmail, approvedBy, sentAt: new Date().toISOString() };
  supplierSandboxLog.unshift(entry);
  res.json({
    ok: true,
    sandboxOnly: true,
    dispatched: entry,
    n8nWebhookCompatible: true,
  });
});

app.post('/api/v1/ai/optimize-discount', (req, res) => {
  res.json(optimizeExpiryDiscount({
    productName: String(req.body?.productName || 'Brown Farm Eggs'),
    stock: Number(req.body?.stock ?? 55),
    unitCost: Number(req.body?.unitCost ?? 10),
    sellingPrice: Number(req.body?.sellingPrice ?? 15),
    daysToExpiry: Number(req.body?.daysToExpiry ?? 4),
    baselineDailySales: Number(req.body?.baselineDailySales ?? 8),
  }));
});

app.post('/api/v1/ai/credit-risk', (req, res) => {
  res.json(scoreCustomerCreditRisk({
    id: String(req.body?.id || 'c1'),
    name: String(req.body?.name || 'Karim Mia'),
    dueAmount: Number(req.body?.dueAmount ?? 3450),
    overdueDays: Number(req.body?.overdueDays ?? 18),
    totalLifetimeCredit: Number(req.body?.totalLifetimeCredit ?? 8000),
    onTimePaymentRate: Number(req.body?.onTimePaymentRate ?? 0.55),
  }));
});

app.post('/api/v1/mcp', (req, res) => res.json(handleMcpRpc(req.body)));
app.post('/api/v1/bots/telegram/webhook', (req, res) => res.json({ ok: true, reply: buildTelegramReply(req.body?.message?.text || '') }));

app.post('/api/v1/public-ai/chat', async (req, res) => {
  const started = Date.now();
  const message = String(req.body?.message || '').trim();
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  const guard = checkGuardrails(message);
  if (!guard.safe) {
    res.json({ answer: lang === 'bn' ? '🛡️ নিরাপত্তা গার্ডরেইল: অনুরোধ ব্লক করা হয়েছে।' : '🛡️ Security Guardrail: Request blocked.', provider: 'BizMind Guardrails', blocked: true, latencyMs: Date.now() - started });
    return;
  }
  const graph = runSixAgentStateGraph(message, lang);
  res.json({ answer: graph.answer, trace: graph.trace, generativeUi: graph.generativeUi, provider: 'LangGraph 6-Agent + SQL/pgvector', latencyMs: Date.now() - started });
});

export default app;
