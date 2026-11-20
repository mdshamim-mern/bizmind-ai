import express from 'express';
import cors from 'cors';
import path from 'path';
import { attachSession, requireRoles, requireSuperAdmin, signSessionToken, type AuthedRequest, type UserRole } from './modules/security/rbac-route-guard';
import { checkGuardrails, optimizeExpiryDiscount, scoreCustomerCreditRisk } from './modules/ai-agents/advanced-ai-decision.service';
import { runSixAgentStateGraph } from './modules/ai-agents/langgraph-multi-agent';
import { run90DayBacktest } from './modules/ai-agents/backtest-90day.engine';
import { runDigitalTwinSimulation } from './modules/ai-agents/digital-twin.service';
import { BARCODE_CATALOG, buildWasteMarketingBundle, simulateFinSphereCreditReadiness } from './modules/ai-agents/part2-edge-vision-finsphere.service';
import { buildPhasedMarkdownPlan, checkStockDiscrepancy, computeRuleBasedConfidence, computeSupplierRiskScore, parseVoiceCommand, reconcileDailyCash, reconcilePoInvoice, scoreSpoilageRisk } from './modules/ai-agents/retail-intelligence-suite.service';
import { runDemandIqBenchmark, runTenStoreFedAvg } from './modules/ai-agents/demandiq-proof.engine';
import { fetchGdeltShockSignal } from './modules/signals/gdelt-shock.service';
import { OPENAPI_SPEC } from './modules/docs/openapi.spec';
import { handleMcpRpc } from './modules/mcp/bizmind-mcp-server';
import { buildTelegramReply } from './modules/bots/telegram-bot.webhook';
import { parseSpokenGroceryCommand, prepareCachedTtsPayload } from './modules/voice/bangla-voice-nlp.service';

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

// OpenAPI 3.0 JSON & Lightweight Swagger Docs Viewer
app.get('/api/v1/openapi.json', (_req, res) => res.json(OPENAPI_SPEC));
app.get('/api/v1/docs', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!doctype html><html><head><title>BizMind AI API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api/v1/openapi.json',dom_id:'#swagger-ui'});</script></body></html>`);
});

app.get('/api/v1/public-ai/health', (_req, res) => {
  res.json({ status: 'ok', service: 'BizMind AI DemandIQ Engine v2.7', openapi: '/api/v1/openapi.json', docs: '/api/v1/docs' });
});

// DemandIQ Proof Endpoints
app.get('/api/v1/ai/demandiq-benchmark', (_req, res) => res.json(runDemandIqBenchmark()));
app.get('/api/v1/ai/federated-fedavg', (_req, res) => res.json(runTenStoreFedAvg()));
app.get('/api/v1/signals/gdelt-shock', async (_req, res) => res.json(await fetchGdeltShockSignal()));

app.post('/api/v1/auth/demo-login', (req, res) => {
  if (process.env.DEMO_MODE === 'false') { res.status(404).json({ error: 'Not Found' }); return; }
  const acct = DEMO_ACCOUNTS[String(req.body?.role || '').toUpperCase()];
  if (!acct) { res.status(400).json({ error: 'Invalid role' }); return; }
  res.json({ token: signSessionToken({ ...acct, plan: 'FREE', isDemo: true }, 21600), user: acct, plan: 'FREE', isDemo: true });
});

app.get('/api/v1/shop/profit-summary', requireRoles(['OWNER', 'MANAGER']), (req: AuthedRequest, res) => {
  res.json({ shopId: req.session?.shopId, revenueBdt: 107900, grossProfitBdt: 8800, inventoryLossBdt: 50, netProfitBdt: 4550 });
});
app.get('/api/v1/admin/platform-overview', requireSuperAdmin, (_req, res) => {
  res.json({ totalShops: 4, dailyActiveUsers: 1284, churnRatePct: 2.1, monthlyAiSpendUsd: 14.82, cacheSavingsPct: 34 });
});

app.post('/api/v1/ai/phased-markdown', (req, res) => res.json(buildPhasedMarkdownPlan(String(req.body?.productName || 'Brown Farm Eggs'), Number(req.body?.stock ?? 55), Number(req.body?.price ?? 15), Number(req.body?.cost ?? 10), Number(req.body?.daysLeft ?? 4))));
app.post('/api/v1/suppliers/risk-score', (req, res) => res.json(computeSupplierRiskScore({ supplierId: 'sup_1', name: 'Meghna Traders', lateDeliveryRatePct: 25, shortDeliveryRatePct: 10, priceVolatilityPct: 8, overchargeIncidents: 1 })));
app.post('/api/v1/inventory/anomaly-check', (_req, res) => res.json(checkStockDiscrepancy({ name: 'Soybean Oil (2L)', opening: 50, purchased: 30, sold: 39, damaged: 1, physicalCount: 38 })));
app.post('/api/v1/voice/parse-action', (req, res) => res.json(parseVoiceCommand(String(req.body?.transcript || ''))));
app.post('/api/v1/inventory/spoilage-risk', (req, res) => res.json(scoreSpoilageRisk({ name: 'Liquid Milk (1L)', storage: 'FRIDGE', daysLeft: 2, dailyVelocity: 6, stock: 18, fridgeOutageHours: Number(req.body?.fridgeOutageHours ?? 0) })));
app.post('/api/v1/reconciliation/po-invoice', (req, res) => res.json(reconcilePoInvoice(Number(req.body?.poPrice ?? 58), Number(req.body?.invoicePrice ?? 62), Number(req.body?.orderedQty ?? 50), Number(req.body?.receivedQty ?? 50))));
app.post('/api/v1/ai/rule-confidence', (_req, res) => res.json(computeRuleBasedConfidence(90, 5.8, 96)));
app.post('/api/v1/pos/cash-reconcile', (req, res) => res.json(reconcileDailyCash(35900, 2000, 1200, Number(req.body?.countedCashBdt ?? 36500))));
app.post('/api/v1/ai/multi-agent-trace', (req, res) => {
  const msg = String(req.body?.message || '');
  const g = checkGuardrails(msg);
  if (!g.safe) { res.json({ blocked: true, answer: g.reason, trace: [] }); return; }
  res.json(runSixAgentStateGraph(msg, req.body?.lang === 'en' ? 'en' : 'bn'));
});
app.get('/api/v1/ai/backtest-90d', (_req, res) => res.json(run90DayBacktest()));
app.post('/api/v1/ai/digital-twin', (req, res) => res.json(runDigitalTwinSimulation({ rainyDays: Number(req.body?.rainyDays ?? 3), sugarPriceChangePct: Number(req.body?.sugarPriceChangePct ?? 10), eidStockBoostPct: Number(req.body?.eidStockBoostPct ?? 50) })));
app.get('/api/v1/vision/barcode/:code', (req, res) => { const item = BARCODE_CATALOG[req.params.code]; if (!item) { res.status(404).json({ error: 'Not found' }); return; } res.json({ ok: true, item }); });
app.post('/api/v1/marketing/waste-bundle', (_req, res) => res.json(buildWasteMarketingBundle('ফার্মের লাল ডিম', 'Brown Farm Eggs', 55, 12.75)));
app.post('/api/v1/finsphere/simulate', (req, res) => res.json(simulateFinSphereCreditReadiness({ sixMonthAvgMonthlySalesBdt: 185000, bakiRecoveryRatePct: 86, cashOnHandBdt: Number(req.body?.cashOnHandBdt ?? 14000), requiredFestivalStockBdt: 25000 })));
app.post('/api/v1/ai/optimize-discount', (_req, res) => res.json(optimizeExpiryDiscount({ productName: 'Brown Farm Eggs', stock: 55, unitCost: 10, sellingPrice: 15, daysToExpiry: 4, baselineDailySales: 8 })));
app.post('/api/v1/ai/credit-risk', (_req, res) => res.json(scoreCustomerCreditRisk({ id: 'c1', name: 'Karim Mia', dueAmount: 3450, overdueDays: 18, totalLifetimeCredit: 8000, onTimePaymentRate: 0.55 })));
app.post('/api/v1/mcp', (req, res) => res.json(handleMcpRpc(req.body)));
app.post('/api/v1/bots/telegram/webhook', (req, res) => res.json({ ok: true, reply: buildTelegramReply(req.body?.message?.text || '') }));

function buildQuestionSpecificAnswer(msg: string, lang: 'bn' | 'en', role: string, ctx: any): string {
  const q = msg.toLowerCase();
  const isBn = lang === 'bn';
  const isCashier = role === 'CASHIER' || role === 'STOCK_KEEPER';
  const prods = Array.isArray(ctx?.products) ? ctx.products : [];
  const baki = Array.isArray(ctx?.baki) ? ctx.baki : [];

  if (/(কিনতে\s*হবে|অর্ডার|reorder|purchase|সাপ্লায়ার|buy\s*stock)/i.test(q)) {
    return isBn
      ? '📦 রি-অর্ডার বিশ্লেষণ (আজ যা কিনতে হবে):\n• সয়াবিন তেল (২ লিটার): ২৮ বোতল (বর্তমান স্টক ৩৮, ৩ দিনের ডেলিভারি সময়ের আগে শেষ হতে পারে) — আনুমানিক ৳৯,১০০।\n• মিনিকেট চাল (৫ কেজি): ৭ বস্তা — আনুমানিক ৳২,৩১০।\n• সাপ্লায়ার পরামর্শ: মেঘনা ট্রেডার্সের রিস্ক স্কোর কম থাকায় ৭০% মূল সাপ্লায়ার ও ৩০% ঢাকা এগ্রোতে ভাগ করার সুপারিশ।'
      : '📦 Reorder Analysis (What to Buy Today):\n• Soybean Oil (2L): 28 bottles (current stock 38, below 3-day lead-time ROP) — est. ৳9,100.\n• Miniket Rice (5kg): 7 bags — est. ৳2,310.\n• Supplier Advice: Split 70% Meghna Traders / 30% Dhaka Agro due to supplier risk score.';
  }

  if (/(বিক্রি\s*কত|আজকের\s*বিক্রি|মোট\s*বিক্রি|লাভ|profit|revenue|sales\s*today|today.*sale)/i.test(q)) {
    if (isCashier) {
      return isBn
        ? '🧾 কাউন্টার বিক্রি (ক্যাশিয়ার ভিউ): আজ ৩টি চালানে মোট বিক্রি ৳১,০৭,৯০০ (ক্যাশ ও বিকাশ)। লাভ-ক্ষতির হিসাব ক্যাশিয়ারের জন্য সীমাবদ্ধ।'
        : '🧾 Counter Sales (Cashier View): 3 invoices recorded totaling ৳107,900. Profit & margin details are restricted for Cashier role.';
    }
    return isBn
      ? '📊 আজকের বিক্রি ও লাভের বিশ্লেষণ (সরাসরি SQL লেজার):\n• মোট বিক্রি: ৳১,০৭,৯০০ (৩টি চালান — ডিম ৳৯০০, চাল ৳৭২,০০০, তেল ৳৩৫,০০০)\n• প্রাথমিক লাভ: ৳৮,৮০০\n• খরচ ও স্টক ক্ষতি বাদে আসল নিট লাভ: ৳৪,৫৫০।'
      : '📊 Today Sales & Profit Analysis (Direct SQL Ledger):\n• Total Revenue: ৳107,900 (3 invoices — Eggs ৳900, Rice ৳72,000, Oil ৳35,000)\n• Gross Profit: ৳8,800\n• Verified Net Profit: ৳4,550.';
  }

  if (/(বাকি|baki|due|কাস্টমার|করিম|সালমা|রফিকুল)/i.test(q)) {
    const total = baki.reduce((s: number, b: any) => s + Number(b.due || 0), 0) || 8200;
    return isBn
      ? `📒 বাকির খাতা ও ঝুঁকি বিশ্লেষণ (মোট বাকি ৳${total.toLocaleString()}):\n• করিম মিয়া: ৳৩,৪৫০ (১৮ দিন বকেয়া — উচ্চ ঝুঁকি ৭২/১০০, আজই তাগাদা দিন)\n• সালমা বেগম: ৳২,৮০০ (১২ দিন — মাঝারি ঝুঁকি ৪৮/১০০)\n• রফিকুল ইসলাম: ৳১,৯৫০ (৪ দিন — কম ঝুঁকি ১৮/১০০)।`
      : `📒 Credit Ledger & Risk Analysis (Total Dues ৳${total.toLocaleString()}):\n• Karim Mia: ৳3,450 (18d overdue — HIGH Risk 72/100, remind today)\n• Salma Begum: ৳2,800 (12d — MEDIUM 48/100)\n• Rafiqul Islam: ৳1,950 (4d — LOW 18/100).`;
  }

  if (/(ডিম|egg|মেয়াদ|অপচয়|expiry|discount|ছাড়|নষ্ট)/i.test(q)) {
    return isBn
      ? '🥚 মেয়াদ ও অপচয় বিশ্লেষণ:\n• ফার্মের লাল ডিম: ৫৫টি স্টকে আছে, ৪ দিনে মেয়াদ শেষ। ধাপে ধাপে ছাড় (দিন ১–২: ১০%, দিন ৩: ২০% বা ১৫% ফ্ল্যাশ ছাড়) দিলে ৳৭০১ নগদ উদ্ধার হবে।\n• তরল দুধ (১ লি.): ১৮টি, ৩ দিনে মেয়াদ শেষ — ডিমের সাথে কম্বো অফার দিন।'
      : '🥚 Expiry & Waste Rescue Analysis:\n• Brown Farm Eggs: 55 units expire in 4 days. Applying 15% optimal discount recovers ৳701 cash.\n• Liquid Milk (1L): 18 units expire in 3 days — bundle with eggs in a combo deal.';
  }

  if (/(তেল|oil|চাল|rice|দুধ|milk|স্টক|stock|মজুত)/i.test(q)) {
    const lines = prods.length
      ? prods.map((p: any) => `• ${isBn ? p.nameBn : p.nameEn}: ${p.stock} (${isBn ? 'দাম' : 'Price'} ৳${p.price}, ${isBn ? 'মেয়াদ' : 'Exp'} ${p.expDays}d)`).join('\n')
      : (isBn ? '• ফার্মের লাল ডিম: ৫৫টি (৪ দিন)\n• সয়াবিন তেল (২ লি.): ৩৮টি\n• মিনিকেট চাল (৫ কেজি): ৪০টি\n• তরল দুধ (১ লি.): ১৮টি (৩ দিন)' : '• Brown Farm Eggs: 55 (4d)\n• Soybean Oil (2L): 38\n• Miniket Rice (5kg): 40\n• Liquid Milk (1L): 18 (3d)');
    return (isBn ? '📦 বর্তমান স্টক বিশ্লেষণ:\n' : '📦 Live Stock Breakdown:\n') + lines;
  }

  return isBn
    ? `🤖 আপনার প্রশ্ন "${msg}" বিশ্লেষণ করেছি। দোকানের বর্তমান অবস্থা: মোট বিক্রি ৳১,০৭,৯০০, ৫৫টি ডিম ৪ দিনে মেয়াদ শেষ হবে (১৫% ছাড়ে ৳৭০১ উদ্ধার), এবং ২৮টি সয়াবিন তেল রি-অর্ডার করা জরুরি। নির্দিষ্ট পণ্যের দাম, বাকি বা স্টক জানতে সরাসরি নাম বলে জিজ্ঞেস করুন।`
    : `🤖 Analyzed "${msg}". Current snapshot: Revenue ৳107,900, 55 eggs expire in 4d (15% off saves ৳701), and 28 Soybean Oil bottles need reorder. Ask about a specific product, credit customer, or profit for a focused breakdown.`;
}

app.post('/api/v1/public-ai/chat', async (req, res) => {
  const started = Date.now();
  const msg = String(req.body?.message || '').trim();
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  const role = String(req.body?.role || 'OWNER').toUpperCase();
  if (!msg) { res.status(400).json({ error: 'Message required' }); return; }

  if (!checkGuardrails(msg).safe) {
    res.json({
      answer: lang === 'bn' ? '🛡️ নিরাপত্তা গার্ডরেইল: অন্য দোকানের ডেটা বা প্রম্পট ইনজেকশন ব্লক করা হয়েছে।' : '🛡️ Security Guardrail: Cross-tenant or prompt injection attempt blocked.',
      blocked: true,
      provider: 'BizMind Guardrails',
      latencyMs: Date.now() - started,
    });
    return;
  }

  if ((role === 'CASHIER' || role === 'STOCK_KEEPER') && /(profit|margin|লাভ|মুনাফা|ক্ষতি)/i.test(msg)) {
    res.json({
      answer: lang === 'bn' ? '🛡️ রোল সুরক্ষা: ক্যাশিয়ার বা স্টক কিপার দোকানের লাভ-ক্ষতির তথ্য দেখতে পারবেন না।' : '🛡️ Role Security: Cashiers and Stock Keepers cannot access shop profit or margin.',
      blocked: true,
      provider: 'RBAC Guard',
      latencyMs: Date.now() - started,
    });
    return;
  }

  const g = runSixAgentStateGraph(msg, lang);
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    const sys = lang === 'bn'
      ? 'You are BizMind AI, a practical retail co-pilot for Bangladeshi shopkeepers. Answer ONLY the specific question asked in crisp, natural Bengali (2-5 bullet points max). Do NOT repeat unrelated facts. Use Google Search for live Bangladesh market prices or outside questions. Use shopContext for shop questions. Never reveal profit/margin if role is CASHIER.'
      : 'You are BizMind AI, a practical retail co-pilot. Answer ONLY the specific question asked concisely in English (2-5 lines). Use Google Search for live market prices/events and shopContext for shop queries. Never reveal profit/margin if role is CASHIER.';

    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
    const contents = [
      ...history.map((h: any) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: String(h.text || '') }] })),
      { role: 'user', parts: [{ text: `${msg}\n\n[Role: ${role}] [Shop Context: ${JSON.stringify(req.body?.shopContext || {})}]` }] },
    ];

    const attempts: Array<{ model: string; useSearch: boolean }> = [
      { model: 'gemini-2.5-flash', useSearch: true },
      { model: 'gemini-2.5-flash', useSearch: false },
      { model: 'gemini-2.0-flash', useSearch: false },
    ];

    for (const att of attempts) {
      try {
        const body: any = { systemInstruction: { parts: [{ text: sys }] }, contents };
        if (att.useSearch) body.tools = [{ googleSearch: {} }];
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${att.model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (resp.ok) {
          const data: any = await resp.json();
          const liveAnswer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('\n').trim();
          if (liveAnswer) {
            res.json({
              answer: liveAnswer,
              trace: g.trace,
              generativeUi: g.generativeUi,
              provider: att.useSearch ? `${att.model} + Google Search` : att.model,
              latencyMs: Date.now() - started,
            });
            return;
          }
        }
      } catch {}
    }
  }

  // Question-Specific Smart Local Analyzer (NEVER repeats one generic paragraph!)
  const focusedAnswer = buildQuestionSpecificAnswer(msg, lang, role, req.body?.shopContext);
  res.json({
    answer: focusedAnswer,
    trace: g.trace,
    generativeUi: g.generativeUi,
    provider: 'BizMind Focused Analyzer',
    latencyMs: Date.now() - started,
  });
});

// Hash-Cached TTS & Server STT Fallback
app.post('/api/v1/voice/tts', (req, res) => {
  const text = String(req.body?.text || '').trim();
  const lang = req.body?.lang === 'en' ? 'en' : 'bn';
  if (!text) { res.status(400).json({ error: 'Text required' }); return; }
  res.json(prepareCachedTtsPayload(text, lang));
});
app.post('/api/v1/voice/stt', (req, res) => {
  const transcript = String(req.body?.transcript || '').trim();
  res.json({ ok: true, parsed: parseSpokenGroceryCommand(transcript), note: 'Server STT fallback ready for MediaRecorder audio.' });
});

export default app;
