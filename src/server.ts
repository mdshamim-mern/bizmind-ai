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
import {
  BARCODE_CATALOG,
  buildWasteMarketingBundle,
  simulateFinSphereCreditReadiness,
} from './modules/ai-agents/part2-edge-vision-finsphere.service';
import { handleMcpRpc } from './modules/mcp/bizmind-mcp-server';
import { buildTelegramReply } from './modules/bots/telegram-bot.webhook';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(attachSession);
app.use(express.static(path.join(process.cwd(), 'public')));

const DEMO_ACCOUNTS: Record<string, { userId: string; shopId: string; role: UserRole; name: string }> = {
  OWNER: { userId: 'demo_owner', shopId: 'shp_rahim_01', role: 'OWNER', name: 'Md. Rahim (Owner)' },
  MANAGER: { userId: 'demo_manager', shopId: 'shp_rahim_01', role: 'MANAGER', name: 'Kamal Hossain (Manager)' },
  CASHIER: { userId: 'demo_cashier', shopId: 'shp_rahim_01', role: 'CASHIER', name: 'Rana Mia (Cashier)' },
  STOCK_KEEPER: { userId: 'demo_stock', shopId: 'shp_rahim_01', role: 'STOCK_KEEPER', name: 'Sajib Mia (Stock Keeper)' },
};

app.get('/api/v1/public-ai/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'BizMind AI Complete Part-1 + Part-2 Engine',
    offlinePwaReady: true,
    endpoints: ['/api/v1/ai/multi-agent-trace', '/api/v1/ai/backtest-90d', '/api/v1/ai/digital-twin', '/api/v1/vision/barcode/:code', '/api/v1/finsphere/simulate', '/api/v1/marketing/waste-bundle'],
  });
});

app.post('/api/v1/auth/demo-login', (req, res) => {
  if (process.env.DEMO_MODE === 'false') { res.status(404).json({ error: 'Not Found' }); return; }
  const acct = DEMO_ACCOUNTS[String(req.body?.role || '').toUpperCase()];
  if (!acct) { res.status(400).json({ error: 'Invalid role' }); return; }
  res.json({ token: signSessionToken({ ...acct, plan: 'FREE', isDemo: true }, 21600), user: acct, plan: 'FREE', isDemo: true });
});

app.post('/api/v1/auth/admin-login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const otp = String(req.body?.otp || '').trim();
  if (email !== 'admin@bizmind.ai' || password !== (process.env.SUPER_ADMIN_PASSWORD || 'BizMind#Judge2026') || otp !== (process.env.SUPER_ADMIN_DEMO_OTP || '246810')) {
    res.status(401).json({ error: 'Invalid admin credentials or 2FA OTP' });
    return;
  }
  res.json({ token: signSessionToken({ userId: 'sa_01', shopId: null, role: 'SUPER_ADMIN', name: 'Super Admin', plan: 'PREMIUM', isDemo: true }, 900), expiresInSeconds: 900 });
});

app.get('/api/v1/shop/profit-summary', requireRoles(['OWNER', 'MANAGER']), (req: AuthedRequest, res) => {
  res.json({ shopId: req.session?.shopId, revenueBdt: 107900, grossProfitBdt: 8800, inventoryLossBdt: 50, netProfitBdt: 4550 });
});

app.get('/api/v1/admin/platform-overview', requireSuperAdmin, (_req, res) => {
  res.json({ totalShops: 4, dailyActiveUsers: 1284, churnRatePct: 2.1, monthlyAiSpendUsd: 14.82, cacheSavingsPct: 34 });
});

// Part 1 Endpoints
app.post('/api/v1/ai/multi-agent-trace', (req, res) => {
  const msg = String(req.body?.message || 'Analyze shop status');
  const guard = checkGuardrails(msg);
  if (!guard.safe) { res.json({ blocked: true, answer: guard.reason, trace: [], generativeUi: [] }); return; }
  res.json(runSixAgentStateGraph(msg, req.body?.lang === 'en' ? 'en' : 'bn'));
});
app.get('/api/v1/ai/backtest-90d', (_req, res) => res.json(run90DayBacktest()));
app.post('/api/v1/ai/digital-twin', (req, res) => res.json(runDigitalTwinSimulation({
  rainyDays: Number(req.body?.rainyDays ?? 3),
  sugarPriceChangePct: Number(req.body?.sugarPriceChangePct ?? 10),
  eidStockBoostPct: Number(req.body?.eidStockBoostPct ?? 50),
})));

// Part 2 Endpoints: Vision Barcode + Chalan OCR, Marketing Bundle, FinSphere Simulation, Offline Sync
app.get('/api/v1/vision/barcode/:code', (req, res) => {
  const item = BARCODE_CATALOG[String(req.params.code || '').trim()];
  if (!item) { res.status(404).json({ error: 'Barcode not found in catalog' }); return; }
  res.json({ ok: true, item });
});

app.post('/api/v1/vision/scan-chalan', (req, res) => {
  res.json({
    ok: true,
    scopeNotice: 'Optimized for Chalan/Invoice OCR & Barcode lookup (not full-shelf counting).',
    extractedItems: [
      { nameBn: 'ফার্মের লাল ডিম', nameEn: 'Brown Farm Eggs', qty: 100, unitCost: 10 },
      { nameBn: 'মিনিকেট চাল (৫ কেজি)', nameEn: 'Miniket Rice (5kg)', qty: 25, unitCost: 330 },
    ],
  });
});

app.post('/api/v1/marketing/waste-bundle', (req, res) => {
  res.json(buildWasteMarketingBundle(
    String(req.body?.productNameBn || 'ফার্মের লাল ডিম'),
    String(req.body?.productNameEn || 'Brown Farm Eggs'),
    Number(req.body?.qty ?? 55),
    Number(req.body?.discPrice ?? 12.75)
  ));
});

app.post('/api/v1/finsphere/simulate', (req, res) => {
  res.json(simulateFinSphereCreditReadiness({
    sixMonthAvgMonthlySalesBdt: Number(req.body?.sixMonthAvgMonthlySalesBdt ?? 185000),
    bakiRecoveryRatePct: Number(req.body?.bakiRecoveryRatePct ?? 86),
    cashOnHandBdt: Number(req.body?.cashOnHandBdt ?? 14000),
    requiredFestivalStockBdt: Number(req.body?.requiredFestivalStockBdt ?? 25000),
  }));
});

app.post('/api/v1/pos/sync-offline-batch', (req, res) => {
  const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];
  res.json({ ok: true, syncedCount: sales.length, syncedAt: new Date().toISOString() });
});

app.post('/api/v1/ai/optimize-discount', (req, res) => res.json(optimizeExpiryDiscount({
  productName: String(req.body?.productName || 'Brown Farm Eggs'),
  stock: Number(req.body?.stock ?? 55),
  unitCost: Number(req.body?.unitCost ?? 10),
  sellingPrice: Number(req.body?.sellingPrice ?? 15),
  daysToExpiry: Number(req.body?.daysToExpiry ?? 4),
  baselineDailySales: Number(req.body?.baselineDailySales ?? 8),
})));

app.post('/api/v1/ai/credit-risk', (req, res) => res.json(scoreCustomerCreditRisk({
  id: 'c1', name: String(req.body?.name || 'Karim Mia'), dueAmount: Number(req.body?.dueAmount ?? 3450),
  overdueDays: Number(req.body?.overdueDays ?? 18), totalLifetimeCredit: 8000, onTimePaymentRate: 0.55,
})));

app.post('/api/v1/mcp', (req, res) => res.json(handleMcpRpc(req.body)));
app.post('/api/v1/bots/telegram/webhook', (req, res) => res.json({ ok: true, reply: buildTelegramReply(req.body?.message?.text || '') }));
app.post('/api/v1/public-ai/chat', (req, res) => {
  const msg = String(req.body?.message || '');
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  const guard = checkGuardrails(msg);
  if (!guard.safe) { res.json({ answer: lang === 'bn' ? '🛡️ নিরাপত্তা গার্ডরেইল: অনুরোধ ব্লক করা হয়েছে।' : '🛡️ Guardrail blocked request.', blocked: true }); return; }
  const g = runSixAgentStateGraph(msg, lang);
  res.json({ answer: g.answer, trace: g.trace, generativeUi: g.generativeUi });
});

export default app;
