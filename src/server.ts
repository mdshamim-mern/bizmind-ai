import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Allow requests from GitHub Pages ([invalid URL]) and Vercel
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

// 1. Health check to verify GEMINI_API_KEY is live on Vercel
app.get('/api/v1/public-ai/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'BizMind AI Live Voice & Search Engine',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// 2. Public Zero-Setup Voice AI with Live Google Search Grounding
[invalid URL]('/api/v1/public-ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, lang, history = [], shopContext = {} } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.status(500).json({
        success: false,
        answer: lang === 'en'
          ? 'Server GEMINI_API_KEY is missing in Vercel Environment Variables.'
          : 'Vercel-এ GEMINI_API_KEY সেট করা নেই। অনুগ্রহ করে Environment Variables চেক করুন।',
      });
      return;
    }

    const systemPrompt = `You are BizMind AI, a warm, intelligent voice assistant for Bangladeshi shopkeepers and everyday users.
- Always respond in ${lang === 'en' ? 'clear, natural English' : 'natural, friendly pure Bengali (Bangla)'}.
- Answer ONLY what the user actually asks. Keep answers concise (2-4 sentences) so they sound natural when read aloud.
- If the user asks about live market prices (like potato price in Kurigram, Bogura, Joypurhat, or Dhaka), weather, or current events, USE Google Search to give the latest accurate info in BDT (৳).
- If the user asks about their shop, use this live shop [invalid URL] ${JSON.stringify(shopContext)}.
- If the user wants to chat casually or tell stories, talk naturally like a friendly human companion.`;

    const contents = [
      ...history.slice(-6).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.text || '') }],
      })),
      { role: 'user', parts: [{ text: String(message || '') }] },
    ];

    const geminiResp = await fetch(
      `[invalid URL]`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ google_search: {} }],
        }),
      }
    );

    const [invalid URL] any = await geminiResp.json();
    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .join('')
      .trim();

    if (!answer) {
      res.status(502).json({
        success: false,
        error: data?.error?.message || 'Empty Gemini response',
      });
      return;
    }

    res.json({ success: true, answer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

// 3. Serve Dashboard at / and /dashboard
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/dashboard', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`BizMind AI running on port ${PORT}`));
}

export default app;
