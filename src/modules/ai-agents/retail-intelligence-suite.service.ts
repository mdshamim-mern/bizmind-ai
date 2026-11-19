/**
 * BizMind AI — Retail Intelligence Suite (Items 11, 12, 13, 15, 16-Light, 18, 19+21, 20 + Bonus)
 * Pure TypeScript, zero external runtime dependencies (Vercel-safe).
 */

// #11: Dynamic Markdown & Phased Clearance (with explicit assumptions, no customer segments)
export function buildPhasedMarkdownPlan(productName: string, stock: number, price: number, cost: number, daysLeft: number) {
  const step1Price = Math.max(cost, Number((price * 0.90).toFixed(2)));
  const step2Price = Math.max(cost, Number((price * 0.80).toFixed(2)));
  return {
    productName,
    stock,
    daysLeft,
    assumptionNoticeBn: 'ধরে নেওয়া মান: ১০% ছাড়ে বিক্রি +৩০%, ২০% ছাড়ে বিক্রি +৫৫% (ডেটা কম থাকায় স্ট্যান্ডার্ড ইলাস্টিসিটি ব্যবহৃত)।',
    assumptionNoticeEn: 'Explicit Assumption: 10% off lifts demand +30%, 20% off lifts demand +55% (standard elasticity used due to short history).',
    phases: [
      { phase: 'Day 1–2', discountPct: 10, newPrice: step1Price, action: 'In-store shelf tag + 10% markdown' },
      { phase: 'Day 3', discountPct: 20, newPrice: step2Price, action: 'Flash 20% clearance + SMS draft' },
      { phase: 'Day 4 (Final)', discountPct: 20, newPrice: step2Price, action: 'Combo bundle with Liquid Milk (1L)' },
    ],
  };
}

// #12: Supplier Risk Score (0-100, Pure Math — No LLM)
export interface SupplierMetrics {
  supplierId: string;
  name: string;
  lateDeliveryRatePct: number;  // computed from actualDeliveryDate > promisedDeliveryDate
  shortDeliveryRatePct: number; // computed from receivedQty < orderedQty
  priceVolatilityPct: number;
  overchargeIncidents: number;
}

export function computeSupplierRiskScore(s: SupplierMetrics) {
  // Higher score = healthier supplier (0-100)
  const latePenalty = Math.min(40, Math.round(s.lateDeliveryRatePct * 0.8));
  const shortPenalty = Math.min(30, Math.round(s.shortDeliveryRatePct * 1.2));
  const volPenalty = Math.min(20, Math.round(s.priceVolatilityPct * 1.5));
  const overchargePenalty = Math.min(25, s.overchargeIncidents * 12);
  const score = Math.max(0, 100 - latePenalty - shortPenalty - volPenalty - overchargePenalty);

  return {
    supplierId: s.supplierId,
    name: s.name,
    score,
    grade: score >= 75 ? 'RELIABLE' : score >= 50 ? 'WATCH' : 'HIGH_RISK',
    reasons: [
      `Late delivery rate: ${s.lateDeliveryRatePct}% (-${latePenalty} pts)`,
      `Short delivery rate: ${s.shortDeliveryRatePct}% (-${shortPenalty} pts)`,
      `Price volatility: ${s.priceVolatilityPct}% (-${volPenalty} pts)`,
      `Invoice overcharges: ${s.overchargeIncidents} (-${overchargePenalty} pts)`,
    ],
    backupSupplier: score < 70 ? 'Dhaka Agro Wholesale (Score: 91/100, 1-day lead time)' : null,
  };
}

// #13: Anomaly & Shrinkage Detector (Strictly neutral phrasing: "Discrepancy detected, please verify")
export function checkStockDiscrepancy(item: {
  name: string;
  opening: number;
  purchased: number;
  sold: number;
  damaged: number;
  physicalCount: number;
}) {
  const expected = item.opening + item.purchased - item.sold - item.damaged;
  const diff = item.physicalCount - expected;
  return {
    name: item.name,
    expectedStock: expected,
    physicalCount: item.physicalCount,
    discrepancy: diff,
    flagged: diff !== 0,
    messageBn: diff !== 0
      ? `${item.name}: প্রত্যাশিত স্টক ${expected}, গোনা স্টক ${item.physicalCount} (${diff}টি অমিল পাওয়া গেছে, অনুগ্রহ করে যাচাই করুন)।`
      : `${item.name}: স্টক সঠিক আছে (${expected})।`,
    messageEn: diff !== 0
      ? `${item.name}: Expected ${expected}, Physical ${item.physicalCount} (${diff} unit discrepancy detected — please verify).`
      : `${item.name}: Stock reconciled (${expected}).`,
  };
}

// #15: Voice-to-Action Parser (4-5 focused grocery commands, ALWAYS requires confirmation!)
export function parseVoiceCommand(transcript: string) {
  const t = transcript.trim();
  if (/ডিম|egg/i.test(t) && /বিক্রি|sell|sale/i.test(t)) {
    return {
      intent: 'RECORD_SALE',
      requiresConfirmation: true,
      summaryBn: 'আমি বুঝেছি: ২ ডজন ফার্মের লাল ডিম বিক্রি, মোট ৳২৮০ — নিশ্চিত করবেন?',
      summaryEn: 'I understood: Record sale of 2 dozen Brown Farm Eggs (৳280) — confirm?',
      payload: { productId: 'p1', qty: 24, totalBdt: 280 },
    };
  }
  if (/বাকি|baki|due/i.test(t) && /যোগ|add|লেখ/i.test(t)) {
    return {
      intent: 'ADD_BAKI',
      requiresConfirmation: true,
      summaryBn: 'আমি বুঝেছি: রহিমের বাকির খাতায় ৳৫০০ যোগ করা — নিশ্চিত করবেন?',
      summaryEn: 'I understood: Add ৳500 to Rahim credit ledger — confirm?',
      payload: { customer: 'রহিম', amountBdt: 500 },
    };
  }
  if (/বিক্রি\s*কত|today.*sale/i.test(t)) {
    return {
      intent: 'QUERY_SALES',
      requiresConfirmation: false,
      summaryBn: 'আজকের মোট বিক্রি ৳১,০৭,৯০০ এবং নিট লাভ ৳৪,৫৫০।',
      summaryEn: 'Today total sales are ৳107,900 and net profit is ৳4,550.',
    };
  }
  return {
    intent: 'QUERY_REORDER',
    requiresConfirmation: false,
    summaryBn: 'আজ ২৮টি সয়াবিন তেল ও ৭ বস্তা মিনিকেট চাল অর্ডার দেওয়া জরুরি।',
    summaryEn: 'Recommended reorder today: 28 Soybean Oil (2L) and 7 Miniket Rice (5kg).',
  };
}

// #16: Spoilage Risk Score (Light, Honest Simulation — No Fake Sensor Claims)
export function scoreSpoilageRisk(item: {
  name: string;
  storage: 'FRIDGE' | 'AMBIENT';
  daysLeft: number;
  dailyVelocity: number;
  stock: number;
  fridgeOutageHours: number; // Simulation toggle
}) {
  const daysToSellOut = item.dailyVelocity > 0 ? item.stock / item.dailyVelocity : 99;
  const urgencyRatio = daysToSellOut / Math.max(0.5, item.daysLeft);
  const outagePenalty = item.storage === 'FRIDGE' ? item.fridgeOutageHours * 7 : 0;
  const score = Math.min(100, Math.round(urgencyRatio * 38 + (item.daysLeft <= 4 ? 30 : 10) + outagePenalty));
  return {
    name: item.name,
    storage: item.storage,
    spoilageRiskScore: score,
    level: score >= 70 ? 'CRITICAL' : score >= 45 ? 'ELEVATED' : 'SAFE',
    simulationNote: item.fridgeOutageHours > 0 ? `Simulation: Fridge outage ${item.fridgeOutageHours}h applied` : 'Standard FEFO model (no IoT sensor)',
  };
}

// #19 & #21: 3-Way PO vs Invoice OCR vs Received Stock Reconciliation
export function reconcilePoInvoice(poPrice: number, invoicePrice: number, orderedQty: number, receivedQty: number) {
  const priceDiff = invoicePrice - poPrice;
  const overchargeBdt = Math.max(0, priceDiff * receivedQty);
  const qtyShortage = Math.max(0, orderedQty - receivedQty);
  return {
    poPrice,
    invoicePrice,
    orderedQty,
    receivedQty,
    priceDiffPerUnit: priceDiff,
    overchargeBdt,
    qtyShortage,
    recommendationBn: overchargeBdt > 0
      ? `চালানে প্রতি কেজি ৳${priceDiff} বেশি (${receivedQty} কেজিতে মোট ৳${overchargeBdt} বেশি) — পেমেন্ট থামানোর সুপারিশ (মালিকের অনুমোদন সাপেক্ষে)।`
      : 'চালান ও PO সঠিকভাবে মিলেছে — পেমেন্ট অনুমোদনযোগ্য।',
    recommendationEn: overchargeBdt > 0
      ? `Invoice charges ৳${priceDiff}/kg extra (৳${overchargeBdt} total overcharge on ${receivedQty}kg) — Recommend holding payment pending owner approval.`
      : 'Invoice matches PO and received quantity — ready for approval.',
  };
}

// #20: Rule-Based Confidence Score (Never asks LLM "how confident are you?")
export function computeRuleBasedConfidence(dataDays: number, historicalMapePct: number, dataCompletenessPct: number) {
  const historyPts = Math.min(35, Math.round((dataDays / 90) * 35));
  const accuracyPts = Math.min(40, Math.max(0, Math.round((1 - historicalMapePct / 40) * 40)));
  const completenessPts = Math.min(25, Math.round((dataCompletenessPct / 100) * 25));
  const score = Math.min(100, historyPts + accuracyPts + completenessPts);
  return {
    score,
    basis: `Data history: ${dataDays}d (+${historyPts}), Backtest MAPE: ${historicalMapePct}% (+${accuracyPts}), Completeness: ${dataCompletenessPct}% (+${completenessPts})`,
  };
}

// Bonus: Daily Cash Drawer Reconciliation
export function reconcileDailyCash(expectedCashSalesBdt: number, openingFloatBdt: number, cashExpensesBdt: number, countedCashBdt: number) {
  const expectedDrawer = openingFloatBdt + expectedCashSalesBdt - cashExpensesBdt;
  const diff = countedCashBdt - expectedDrawer;
  return { expectedDrawer, countedCashBdt, discrepancyBdt: diff, balanced: diff === 0 };
}
