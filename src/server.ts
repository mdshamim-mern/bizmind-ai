import express from 'express';
import cors from 'cors';
import path from 'path';
import { attachSession, requireRoles, requireSuperAdmin, signSessionToken, type AuthedRequest, type UserRole } from './modules/security/rbac-route-guard';
import { checkGuardrails, optimizeExpiryDiscount, scoreCustomerCreditRisk } from './modules/ai-agents/advanced-ai-decision.service';
import { runSixAgentStateGraph } from './modules/ai-agents/langgraph-multi-agent';
import { run90DayBacktest } from './modules/ai-agents/backtest-90day.engine';
import { runDigitalTwinSimulation } from './modules/ai-agents/digital-twin.service';
import { BARCODE_CATALOG, buildWasteMarketingBundle, simulateFinSphereCreditReadiness } from './modules/ai-agents/part2-edge-vision-finsphere.service';
import {
  buildPhasedMarkdownPlan,
  checkStockDiscrepancy,
  computeRuleBasedConfidence,
  computeSupplierRiskScore,
  parseVoiceCommand,
  reconcileDailyCash,
  reconcilePoInvoice,
  scoreSpoilageRisk,
} from './modules/ai-agents/retail-intelligence-suite.service';
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
  res.json({ status: 'ok', service: 'BizMind AI Complete v3 Engine (Items 1–21 + Safety + XAI)' });
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
    res.status(401).json({ error: 'Invalid credentials or 2FA OTP' }); return;
  }
  res.json({ token: signSessionToken({ userId: 'sa_01', shopId: null, role: 'SUPER_ADMIN', name: 'Super Admin', plan: 'PREMIUM', isDemo: true }, 900) });
});

app.get('/api/v1/shop/profit-summary', requireRoles(['OWNER', 'MANAGER']), (req: AuthedRequest, res) => {
  res.json({ shopId: req.session?.shopId, revenueBdt: 107900, grossProfitBdt: 8800, inventoryLossBdt: 50, netProfitBdt: 4550 });
});
app.get('/api/v1/admin/platform-overview', requireSuperAdmin, (_req, res) => {
  res.json({ totalShops: 4, dailyActiveUsers: 1284, churnRatePct: 2.1, monthlyAiSpendUsd: 14.82, cacheSavingsPct: 34 });
});

// Items 11-21 Endpoints
app.post('/api/v1/ai/phased-markdown', (req, res) => res.json(buildPhasedMarkdownPlan(String(req.body?.productName || 'Brown Farm Eggs'), Number(req.body?.stock ?? 55), Number(req.body?.price ?? 15), Number(req.body?.cost ?? 10), Number(req.body?.daysLeft ?? 4))));
app.post('/api/v1/suppliers/risk-score', (req, res) => res.json(computeSupplierRiskScore({
  supplierId: String(req.body?.supplierId || 'sup_1'),
  name: String(req.body?.name || 'Meghna Traders'),
  lateDeliveryRatePct: Number(req.body?.lateDeliveryRatePct ?? 25),
  shortDeliveryRatePct: Number(req.body?.shortDeliveryRatePct ?? 10),
  priceVolatilityPct: Number(req.body?.priceVolatilityPct ?? 8),
  overchargeIncidents: Number(req.body?.overchargeIncidents ?? 1),
})));
app.post('/api/v1/inventory/anomaly-check', (req, res) => res.json(checkStockDiscrepancy({
  name: String(req.body?.name || 'Soybean Oil (2L)'),
  opening: Number(req.body?.opening ?? 50),
  purchased: Number(req.body?.purchased ?? 30),
  sold: Number(req.body?.sold ?? 39),
  damaged: Number(req.body?.damaged ?? 1),
  physicalCount: Number(req.body?.physicalCount ?? 38),
})));
app.post('/api/v1/voice/parse-action', (req, res) => res.json(parseVoiceCommand(String(req.body?.transcript || ''))));
app.post('/api/v1/inventory/spoilage-risk', (req, res) => res.json(scoreSpoilageRisk({
  name: String(req.body?.name || 'Liquid Milk (1L)'),
  storage: req.body?.storage === 'AMBIENT' ? 'AMBIENT' : 'FRIDGE',
  daysLeft: Number(req.body?.daysLeft ?? 2),
  dailyVelocity: Number(req.body?.dailyVelocity ?? 6),
  stock: Number(req.body?.stock ?? 18),
  fridgeOutageHours: Number(req.body?.fridgeOutageHours ?? 0),
})));
app.post('/api/v1/reconciliation/po-invoice', (req, res) => res.json(reconcilePoInvoice(Number(req.body?.poPrice ?? 58), Number(req.body?.invoicePrice ?? 62), Number(req.body?.orderedQty ?? 50), Number(req.body?.receivedQty ?? 50))));
app.post('/api/v1/ai/rule-confidence', (req, res) => res.json(computeRuleBasedConfidence(Number(req.body?.dataDays ?? 90), Number(req.body?.mapePct ?? 5.8), Number(req.body?.completenessPct ?? 96))));
app.post('/api/v1/pos/cash-reconcile', (req, res) => res.json(reconcileDailyCash(Number(req.body?.expectedCashSalesBdt ?? 35900), Number(req.body?.openingFloatBdt ?? 2000), Number(req.body?.cashExpensesBdt ?? 1200), Number(req.body?.countedCashBdt ?? 36500))));

// Existing Part 1 & 2 Endpoints
app.post('/api/v1/ai/multi-agent-trace', (req, res) => {
  const msg = String(req.body?.message || '');
  const g = checkGuardrails(msg);
  if (!g.safe) { res.json({ blocked: true, answer: g.reason, trace: [] }); return; }
  res.json(runSixAgentStateGraph(msg, req.body?.lang === 'en' ? 'en' : 'bn'));
});
app.get('/api/v1/ai/backtest-90d', (_req, res) => res.json(run90DayBacktest()));
app.post('/api/v1/ai/digital-twin', (req, res) => res.json(runDigitalTwinSimulation({ rainyDays: Number(req.body?.rainyDays ?? 3), sugarPriceChangePct: Number(req.body?.sugarPriceChangePct ?? 10), eidStockBoostPct: Number(req.body?.eidStockBoostPct ?? 50) })));
app.get('/api/v1/vision/barcode/:code', (req, res) => { const item = BARCODE_CATALOG[req.params.code]; if (!item) { res.status(404).json({ error: 'Not found' }); return; } res.json({ ok: true, item }); });
app.post('/api/v1/marketing/waste-bundle', (req, res) => res.json(buildWasteMarketingBundle('ফার্মের লাল ডিম', 'Brown Farm Eggs', 55, 12.75)));
app.post('/api/v1/finsphere/simulate', (req, res) => res.json(simulateFinSphereCreditReadiness({ sixMonthAvgMonthlySalesBdt: 185000, bakiRecoveryRatePct: 86, cashOnHandBdt: Number(req.body?.cashOnHandBdt ?? 14000), requiredFestivalStockBdt: 25000 })));
app.post('/api/v1/ai/optimize-discount', (req, res) => res.json(optimizeExpiryDiscount({ productName: 'Brown Farm Eggs', stock: 55, unitCost: 10, sellingPrice: 15, daysToExpiry: 4, baselineDailySales: 8 })));
app.post('/api/v1/ai/credit-risk', (req, res) => res.json(scoreCustomerCreditRisk({ id: 'c1', name: 'Karim Mia', dueAmount: 3450, overdueDays: 18, totalLifetimeCredit: 8000, onTimePaymentRate: 0.55 })));
app.post('/api/v1/mcp', (req, res) => res.json(handleMcpRpc(req.body)));
app.post('/api/v1/bots/telegram/webhook', (req, res) => res.json({ ok: true, reply: buildTelegramReply(req.body?.message?.text || '') }));
app.post('/api/v1/public-ai/chat', (req, res) => {
  const msg = String(req.body?.message || '');
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  if (!checkGuardrails(msg).safe) { res.json({ answer: lang === 'bn' ? '🛡️ নিরাপত্তা গার্ডরেইল: অনুরোধ ব্লক।' : '🛡️ Guardrail blocked.', blocked: true }); return; }
  const g = runSixAgentStateGraph(msg, lang);
  res.json({ answer: g.answer, trace: g.trace, generativeUi: g.generativeUi });
});

export default app;
