import crypto from 'crypto';

/**
 * BizMind AI — Bangla/Mixed Voice NLP, Speech Cleaner, Hash-Cached TTS & Server STT Fallback
 */

const BANGLA_WORD_NUMBERS: Array<[RegExp, number]> = [
  [/আড়াইশো|আড়াইশো|arai\s*sho/gi, 250],
  [/দেড়শো|দেড়শো|der\s*sho/gi, 150],
  [/এক\s*হাজার|ek\s*hajar/gi, 1000],
  [/পাঁচশো|পাচশো|pach\s*sho/gi, 500],
  [/সাতশো|sat\s*sho/gi, 700],
  [/চারশো|char\s*sho/gi, 400],
  [/তিনশো|tin\s*sho/gi, 300],
  [/দুইশো|dui\s*sho/gi, 200],
  [/একশো|ek\s*sho/gi, 100],
  [/পঞ্চাশ|ponchash/gi, 50],
  [/দুই\s*ডজন|২\s*ডজন|2\s*dozen|two\s*dozen/gi, 24],
  [/এক\s*ডজন|১\s*ডজন|1\s*dozen|one\s*dozen/gi, 12],
];

const BN_DIGITS: Record<string, string> = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

export function normalizeBanglaDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => BN_DIGITS[d] || d);
}

export function extractSpokenNumber(transcript: string): number | null {
  const norm = normalizeBanglaDigits(transcript);
  for (const [rx, val] of BANGLA_WORD_NUMBERS) {
    if (rx.test(norm)) return val;
  }
  const m = norm.match(/\b(\d+(?:\.\d+)?)\b/);
  return m ? Number(m[1]) : null;
}

export function cleanTextForSpeech(rawText: string, lang: 'bn' | 'en' = 'bn'): string {
  let s = rawText
    .replace(/[*_`#~|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/→/g, lang === 'bn' ? ' থেকে ' : ' to ')
    .replace(/৳\s*([০-৯0-9,]+(?:\.[০-৯0-9]+)?)/g, lang === 'bn' ? '$1 টাকা' : '$1 taka')
    .replace(/Soybean\s*Oil/gi, lang === 'bn' ? 'সয়াবিন তেল' : 'Soybean Oil')
    .replace(/Miniket\s*Rice/gi, lang === 'bn' ? 'মিনিকেট চাল' : 'Miniket Rice')
    .replace(/Brown\s*Farm\s*Eggs/gi, lang === 'bn' ? 'ফার্মের লাল ডিম' : 'Brown Farm Eggs')
    .replace(/\s+/g, ' ')
    .trim();

  // Keep only first 1-2 sentences so voice output is crisp and never drones on
  const sentences = s.split(/(?<=[।.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(' ');
}

export function parseSpokenGroceryCommand(transcript: string) {
  const clean = transcript.trim();
  const num = extractSpokenNumber(clean);

  // Guardrail check first (voice is untrusted input!)
  if (/(ignore|other\s+shop|অন্য\s+দোকানের|system\s+prompt|password)/i.test(clean)) {
    return { intent: 'BLOCKED_INJECTION', confidence: 1.0, requiresConfirmation: false };
  }

  if (/(ডিম|egg)/i.test(clean) && /(বিক্রি|sell|sale|বেচ)/i.test(clean)) {
    const qty = num || 24;
    const totalBdt = Math.round(qty * 11.67);
    return { intent: 'RECORD_SALE', confidence: 0.94, requiresConfirmation: true, qty, totalBdt, productBn: 'ফার্মের লাল ডিম', productEn: 'Brown Farm Eggs' };
  }

  if (/(বাকি|baki|due)/i.test(clean) && /(যোগ|add|লেখ|লিখ)/i.test(clean)) {
    const amountBdt = num || 500;
    return { intent: 'ADD_BAKI', confidence: 0.92, requiresConfirmation: true, customer: 'রহিম', amountBdt };
  }

  if (/(soybean|সয়াবিন|তেল|oil|চাল|rice|দুধ|milk)/i.test(clean) && /(কত|stock|আছে|মজুত|how\s*much|left)/i.test(clean)) {
    return { intent: 'QUERY_STOCK', confidence: 0.90, requiresConfirmation: false };
  }

  if (/(বিক্রি\s*কত|today.*sale|আজকের\s*বিক্রি)/i.test(clean)) {
    return { intent: 'QUERY_SALES', confidence: 0.95, requiresConfirmation: false };
  }

  if (/(কিনতে\s*হবে|reorder|অর্ডার)/i.test(clean)) {
    return { intent: 'QUERY_REORDER', confidence: 0.91, requiresConfirmation: false };
  }

  return {
    intent: 'LOW_CONFIDENCE',
    confidence: 0.42,
    requiresConfirmation: false,
    suggestionsBn: ['২ ডজন ডিম বিক্রি লেখো', 'রহিমের ৫০০ টাকা বাকি যোগ করো'],
    suggestionsEn: ['Sell 2 dozen eggs', 'Add 500 baki for Rahim'],
  };
}

// Hash-cached Cloud TTS stub (tracks cache hits & quota)
const ttsCache = new Map<string, { speechText: string; cachedAt: string; hits: number }>();

export function prepareCachedTtsPayload(rawText: string, lang: 'bn' | 'en' = 'bn') {
  const speechText = cleanTextForSpeech(rawText, lang);
  const hash = crypto.createHash('sha256').update(`${lang}:${speechText}`).digest('hex').slice(0, 16);
  const existing = ttsCache.get(hash);
  if (existing) {
    existing.hits += 1;
    return { hash, speechText, cacheHit: true, provider: 'Browser speechSynthesis / Cloud TTS Ready', quotaCharged: 0 };
  }
  ttsCache.set(hash, { speechText, cachedAt: new Date().toISOString(), hits: 1 });
  return { hash, speechText, cacheHit: false, provider: 'Browser speechSynthesis / Cloud TTS Ready', quotaCharged: 1 };
}
