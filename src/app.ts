import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import AuthRoutes from './modules/auth/auth.routes';
import InventoryRoutes from './modules/inventory/inventory.routes';
import { AccountingRoutes } from './modules/accounting/accounting.routes';
import { AIRoutes } from './modules/ai-engine/ai.routes';

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/', (req: Request, res: Response) => {
res.status(200).json({
success: true,
message: 'BizMind AI server is running',
dashboard: '/dashboard',
});
});

app.get('/dashboard', (req: Request, res: Response) => {
res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.use('/api/v1/auth', AuthRoutes);
app.use('/api/v1/inventory', InventoryRoutes);
app.use('/api/v1/accounting', AccountingRoutes);
app.use('/api/v1/ai', AIRoutes);
// Public Zero-Setup Voice AI with Live Google Search Grounding (Gemini 2.5 Flash)
app.post('/api/v1/public-ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, lang, history = [], shopContext = {} } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ success: false, message: 'GEMINI_API_KEY not configured on server.' });
      return;
    }

    const systemPrompt = `You are BizMind AI, a warm, intelligent voice assistant for Bangladeshi shopkeepers and everyday users.
- Always respond in ${lang === 'en' ? 'clear, natural English' : 'natural, friendly pure Bengali (Bangla)'}.
- Answer ONLY what the user actually asks. Keep answers concise (2-4 sentences) so they sound natural when read aloud.
- If the user asks about real-time market prices (like potato price in Bogura or Joypurhat), weather, or news, USE Google Search to give the latest accurate info in BDT (৳).
- If the user asks about their shop, use this live shop data: ${JSON.stringify(shopContext)}.
- If the user wants to chat casually or tell stories, talk naturally like a friendly companion.`;

    const contents = [
      ...history.slice(-6).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.text || '') }],
      })),
      { role: 'user', parts: [{ text: String(message || '') }] },
    ];

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

    const data: any = await geminiResp.json();
    const answer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('').trim();
    if (!answer) {
      res.status(502).json({ success: false, message: 'Empty AI response' });
      return;
    }
    res.json({ success: true, answer });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
export default app;
