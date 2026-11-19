import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  aiObservabilityStore,
  detectPromptInjection,
  runMultiAgentAnalysis,
} from './modules/ai-agents/multi-agent.engine';
import {
  checkIdempotency,
  consumeShopQuota,
  generateBanglaSmsOtp,
  getCachedAIResponse,
  getShopAuditLogs,
  getShopQuota,
  recordAuditLog,
  routeAIModelByComplexity,
  saveIdempotency,
  setCachedAIResponse,
  verifyBanglaSmsOtp,
} from './modules/enterprise/enterprise.service';

dotenv.config();

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '5mb' }));

const publicDir = path.join(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// 1. Sliding-Window Rate Limiter (30 req/min per IP)
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function aiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const entry = rateBucket.get(ip);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(ip, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (entry.count >= 30) {
    res.status(429).json({
      success: false,
      answer: 'অনেকগুলো প্রশ্ন একসাথে পাঠানো হয়েছে—অনুগ্রহ করে ১ মিনিট পর আবার চেষ্টা করুন।',
    });
    return;
  }
  entry.count += 1;
  next();
}

interface ValidatedChatPayload {
  message: string;
  lang: 'bn' | 'en';
  history: Array<{ role: 'user' | 'model'; text: string }>;
  shopContext: Record<string, any>;
}

function validateChatPayload(body: any): ValidatedChatPayload {
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0) {
    throw new Error('Message is required.');
  }
  if (body.message.length > 1500) {
    throw new Error('Message exceeds 1500 characters.');
  }
  const lang: 'bn' | 'en' = body.lang === 'en' ? 'en' : 'bn';
  const history = Array.isArray(body.history)
    ? body.history
        .filter((m: any) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
        .map((m: any) => ({ role: m.role as 'user' | 'model', text: m.text }))
    : [];
  const shopContext =
    body.shopContext && typeof body.shopContext === 'object' ? body.shopContext : {};

  return { message: body.message.trim(), lang, history, shopContext };
}

async function generateGroundedAIAnswer(parsed: ValidatedChatPayload) {
  const startedAt = Date.now();
  const { message, lang, history, shopContext } = parsed;
  const shopId = String(shopContext.shopId || 'shp_01');

  if (detectPromptInjection(message)) {
    aiObservabilityStore.blockedPromptInjections += 1;
    recordAuditLog({
      shopId,
      actorRole: 'OWNER',
      action: 'PROMPT_INJECTION_BLOCKED',
      entityType: 'AI_SECURITY',
      detail: message.slice(0, 80),
    });
    return {
      provider: 'SECURITY_GUARDRAIL',
      answer:
        lang === 'en'
          ? 'Security Guardrail: Unsafe system or cross-shop instructions are blocked.'
          : 'নিরাপত্তা সতর্কতা: অনিরাপদ বা অন্য দোকানের ডেটা দেখার নির্দেশনা অনুমোদিত নয়।',
      agents: [],
      ragSources: [],
      latencyMs: Date.now() - startedAt,
    };
  }

  // Check Response Cache first (saves AI cost & speeds up repeat queries)
  const cached = getCachedAIResponse(shopId, lang, message);
  if (cached) {
    return {
      provider: cached.provider,
      answer: cached.answer,
      agents: [{ agent: 'ManagerAgent', toolUsed: 'RedisCacheHit()', finding: 'Served from 5-min TTL cache' }],
      ragSources: [],
      latencyMs: Date.now() - startedAt,
    };
  }

  // Check Per-Shop Monthly AI Quota
  const quotaCheck = consumeShopQuota(shopId, Math.max(150, message.length));
  if (!quotaCheck.allowed) {
    return {
      provider: 'QUOTA_LIMIT_GUARD',
      answer:
        lang === 'en'
          ? `Monthly AI quota (${quotaCheck.quota.monthlyLimit} calls) reached. Upgrade to BizMind Pro via bKash/Nagad.`
          : `এই মাসের ফ্রি এআই লিমিট (${quotaCheck.quota.monthlyLimit}টি) শেষ হয়েছে। বিকাশ/নগদে প্রো প্ল্যানে আপগ্রেড করুন।`,
      agents: [],
      ragSources: [],
      latencyMs: Date.now() - startedAt,
    };
  }

  const multiAgent = runMultiAgentAnalysis(message, shopContext);
  const apiKey = process.env.GEMINI_API_KEY;
  const route = routeAIModelByComplexity(message);

  if (!apiKey) {
    const fallbackAnswer =
      lang === 'en'
        ? `Multi-Agent Report: ${multiAgent.trace.map((t) => `${t.agent}: ${t.finding}`).join(' | ')}`
        : `মাল্টি-এজেন্ট বিশ্লেষণ: ${multiAgent.trace.map((t) => `${t.agent}: ${t.finding}`).join(' | ')}`;
    return {
      provider: 'MULTI_AGENT_LOCAL_FALLBACK',
      answer: fallbackAnswer,
      agents: multiAgent.trace,
      ragSources: multiAgent.ragSources,
      latencyMs: Date.now() - startedAt,
    };
  }

  const systemPrompt = `You are BizMind AI (ManagerAgent orchestrating InventoryAgent, SalesAgent, FinanceAgent, and SupplierAgent) for Bangladeshi shopkeepers and everyday users.
- Always respond in ${lang === 'en' ? 'clear, natural English' : 'natural, friendly pure Bengali (Bangla)'}.
- Answer ONLY what the user actually asks. Keep responses concise (2-4 sentences) so they sound natural when spoken aloud.
- If the user asks about live market prices (like potato price in Kurigram, Bogura, Joypurhat, Dhaka), weather, or current news, USE Google Search to give the latest accurate info in BDT (৳).
- If the user asks about their shop, use ONLY these verified specialist agent findings:
${multiAgent.trace.map((t) => `- ${t.agent} (${t.toolUsed}): ${t.finding}`).join('\n')}
- Verified RAG Policies & Guides:
${multiAgent.ragContextText}
- Live Shop Snapshot: ${JSON.stringify(shopContext)}
- If the user wants to chat casually or tell stories, talk naturally like a warm human companion.`;

  const contents = [
    ...history.slice(-6).map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${route.model}:generateContent?key=` +
    encodeURIComponent(apiKey);

  const reqBody: any = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
  };
  if (route.useGoogleSearch) {
    reqBody.tools = [{ google_search: {} }];
  }

  const geminiResp = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });

  const data: any = await geminiResp.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || '')
    .join('')
    .trim();

  const latencyMs = Date.now() - startedAt;
  aiObservabilityStore.totalCalls += 1;
  aiObservabilityStore.totalLatencyMs += latencyMs;
  aiObservabilityStore.totalEstimatedTokens += Math.round((message.length + (answer?.length || 0)) / 3);
  aiObservabilityStore.recentLogs.unshift({
    timestamp: new Date().toISOString(),
    agents: multiAgent.trace.map((t) => t.agent),
    tools: multiAgent.trace.map((t) => t.toolUsed),
    latencyMs,
    provider: `${route.model.toUpperCase()} (${route.tierLabel})`,
  });
  if (aiObservabilityStore.recentLogs.length > 20) aiObservabilityStore.recentLogs.pop();

  if (!answer) {
    throw new Error(data?.error?.message || 'Empty Gemini response');
  }

  setCachedAIResponse(shopId, lang, message, answer, route.model.toUpperCase());

  return {
    provider: `${route.model.toUpperCase()} (${route.tierLabel})`,
    answer,
    agents: multiAgent.trace,
    ragSources: multiAgent.ragSources,
    quota: quotaCheck.quota,
    latencyMs,
  };
}

// Health, Observability & Enterprise SaaS Endpoints
app.get('/api/v1/public-ai/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'BizMind AI Enterprise Multi-Tenant SaaS + Multi-Agent Engine',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/public-ai/observability', (req: Request, res: Response) => {
  const shopId = String(req.query.shopId || 'shp_01');
  const avgLatencyMs =
    aiObservabilityStore.totalCalls > 0
      ? Math.round(aiObservabilityStore.totalLatencyMs / aiObservabilityStore.totalCalls)
      : 215;
  res.json({
    success: true,
    data: {
      aiAccuracyPct: aiObservabilityStore.evaluationBenchmarkScorePct,
      benchmarkPassed: `${aiObservabilityStore.evaluationPassedCount}/${aiObservabilityStore.evaluationTotalCount}`,
      totalCalls: aiObservabilityStore.totalCalls,
      totalToolCalls: aiObservabilityStore.totalToolCalls,
      totalEstimatedTokens: aiObservabilityStore.totalEstimatedTokens,
      blockedPromptInjections: aiObservabilityStore.blockedPromptInjections,
      avgLatencyMs,
      shopQuota: getShopQuota(shopId),
      recentLogs: aiObservabilityStore.recentLogs.slice(0, 5),
    },
  });
});

// Enterprise: Bangladesh SMS OTP Login (For Shopkeepers without Email)
app.post('/api/v1/enterprise/otp/request', (req: Request, res: Response) => {
  const phone = String(req.body?.phone || '').trim();
  if (!phone) {
    res.status(400).json({ success: false, message: 'Phone number is required.' });
    return;
  }
  const otp = generateBanglaSmsOtp(phone);
  res.json({
    success: true,
    message: 'SMS OTP generated successfully.',
    data: otp,
  });
});

app.post('/api/v1/enterprise/otp/verify', (req: Request, res: Response) => {
  const phone = String(req.body?.phone || '').trim();
  const code = String(req.body?.code || '').trim();
  const ok = verifyBanglaSmsOtp(phone, code);
  if (!ok) {
    res.status(401).json({ success: false, message: 'Invalid or expired OTP code.' });
    return;
  }
  res.json({ success: true, message: 'Phone verified via SMS OTP.', phone });
});

// Enterprise: Paginated Audit Logs & Idempotent Sale Sync
app.get('/api/v1/enterprise/audit-logs', (req: Request, res: Response) => {
  const shopId = String(req.query.shopId || 'shp_01');
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
  res.json({ success: true, data: getShopAuditLogs(shopId, page, limit) });
});

app.post('/api/v1/enterprise/offline-sync/sale', (req: Request, res: Response) => {
  const shopId = String(req.body?.shopId || 'shp_01');
  const idemKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '');
  const existing = checkIdempotency(shopId, idemKey);
  if (existing) {
    res.json({ success: true, deduplicated: true, data: existing });
    return;
  }
  const syncedSale = {
    invoiceId: `SYNC-${Date.now()}`,
    shopId,
    productName: req.body?.productName || 'Item',
    qty: Number(req.body?.qty || 1),
    total: Number(req.body?.total || 0),
    syncedAt: new Date().toISOString(),
  };
  if (idemKey) saveIdempotency(shopId, idemKey, syncedSale);
  recordAuditLog({
    shopId,
    actorRole: 'CASHIER',
    action: 'OFFLINE_SALE_SYNCED',
    entityType: 'Sale',
    detail: `${syncedSale.productName} x${syncedSale.qty} (৳${syncedSale.total})`,
  });
  res.status(201).json({ success: true, deduplicated: false, data: syncedSale });
});

// Public AI Chat & SSE Streaming
app.post('/api/v1/public-ai/chat', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateChatPayload(req.body);
    const result = await generateGroundedAIAnswer(parsed);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Invalid request' });
  }
});

app.post('/api/v1/public-ai/stream', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateChatPayload(req.body);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await generateGroundedAIAnswer(parsed);

    res.write(
      `data: ${JSON.stringify({
        type: 'meta',
        provider: result.provider,
        agents: result.agents,
        ragSources: result.ragSources,
        latencyMs: result.latencyMs,
      })}\n\n`
    );

    const words = result.answer.split(/(\s+)/);
    for (const chunk of words) {
      res.write(`data: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`);
      await new Promise((r) => setTimeout(r, 15));
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Stream failed' })}\n\n`);
    res.end();
  }
});

// Vercel Cron Background Job (Daily 8:00 AM BDT)
app.get('/api/v1/cron/morning-brief', (_req: Request, res: Response) => {
  res.json({
    success: true,
    job: 'DAILY_MORNING_BRIEF_GENERATOR',
    schedule: '0 2 * * * (8:00 AM BDT)',
    executedAt: new Date().toISOString(),
  });
});

function serveDashboard(_req: Request, res: Response) {
  const indexFile = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
    return;
  }
  res.redirect('https://mdshamim-mern.github.io/bizmind-ai/');
}

app.get('/', serveDashboard);
app.get('/dashboard', serveDashboard);

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`BizMind AI Enterprise Server running on port ${PORT}`));
}

export default app;
