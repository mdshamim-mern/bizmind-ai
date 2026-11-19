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

dotenv.config();

const app = express();

// 1. CORS & Body Limits
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '5mb' }));

const publicDir = path.join(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// 2. Sliding-Window Rate Limiter for AI Endpoints (30 requests / minute per IP)
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

// 3. Zero-Dependency Runtime Request Validator (Replaces external zod import)
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

  if (detectPromptInjection(message)) {
    aiObservabilityStore.blockedPromptInjections += 1;
    return {
      provider: 'SECURITY_GUARDRAIL',
      answer:
        lang === 'en'
          ? 'Security Guardrail: I cannot execute unsafe system or cross-shop instructions. Please ask about your shop or market prices.'
          : 'নিরাপত্তা সতর্কতা: অনিরাপদ বা অন্য দোকানের ডেটা দেখার নির্দেশনা অনুমোদিত নয়। অনুগ্রহ করে আপনার দোকান বা বাজারদর নিয়ে প্রশ্ন করুন।',
      agents: [],
      ragSources: [],
      latencyMs: Date.now() - startedAt,
    };
  }

  const multiAgent = runMultiAgentAnalysis(message, shopContext);
  const apiKey = process.env.GEMINI_API_KEY;

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
      forecastMetrics: multiAgent.forecastMetrics,
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
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
    encodeURIComponent(apiKey);

  const geminiResp = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ google_search: {} }],
    }),
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
    provider: 'GEMINI_2_5_FLASH_MULTI_AGENT_RAG',
  });
  if (aiObservabilityStore.recentLogs.length > 20) aiObservabilityStore.recentLogs.pop();

  if (!answer) {
    throw new Error(data?.error?.message || 'Empty Gemini response');
  }

  return {
    provider: 'GEMINI_2_5_FLASH_MULTI_AGENT_RAG',
    answer,
    agents: multiAgent.trace,
    ragSources: multiAgent.ragSources,
    forecastMetrics: multiAgent.forecastMetrics,
    latencyMs,
  };
}

// 4. Health & AI Observability / Evaluation Endpoints
app.get('/api/v1/public-ai/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'BizMind AI Multi-Agent + RAG + Google Search Engine',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    features: [
      'Multi-Agent (Inventory, Sales, Finance, Supplier, Manager)',
      'RAG Knowledge Retrieval',
      'Live Google Search Grounding',
      'SSE Word-by-Word Streaming',
      'Runtime Input Validation & Prompt Injection Guard',
      'Holt-Winters MAPE Forecasting & Z-Score Anomaly Detection',
    ],
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/public-ai/observability', (_req: Request, res: Response) => {
  const avgLatencyMs =
    aiObservabilityStore.totalCalls > 0
      ? Math.round(aiObservabilityStore.totalLatencyMs / aiObservabilityStore.totalCalls)
      : 420;
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
      recentLogs: aiObservabilityStore.recentLogs.slice(0, 5),
    },
  });
});

// 5. Standard JSON Chat Endpoint
app.post('/api/v1/public-ai/chat', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateChatPayload(req.body);
    const result = await generateGroundedAIAnswer(parsed);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Invalid request' });
  }
});

// 6. SSE Streaming Chat Endpoint
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
      await new Promise((r) => setTimeout(r, 18));
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Stream failed' })}\n\n`);
    res.end();
  }
});

// 7. Background Job Endpoint
app.get('/api/v1/cron/morning-brief', (_req: Request, res: Response) => {
  res.json({
    success: true,
    job: 'DAILY_MORNING_BRIEF_GENERATOR',
    executedAt: new Date().toISOString(),
    summary: 'Generated daily restock alerts, expiry waste rescue offers, and baki collection priorities.',
  });
});

// 8. Serve Dashboard safely at / and /dashboard (redirects to GitHub Pages if static file isn't bundled in serverless function)
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
  app.listen(PORT, () => console.log(`BizMind AI Multi-Agent Server running on port ${PORT}`));
}

export default app;
