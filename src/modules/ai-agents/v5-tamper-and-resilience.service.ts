import crypto from 'crypto';

// #27: Stockout-Adjusted Demand ("হারানো বিক্রি সংশোধন") — Honest, no "Causal Inference" hype
export function computeStockoutLostSales(
  productName: string,
  unitPriceBdt: number,
  dailySales: Array<{ day: number; sold: number; outOfStock: boolean; isPromo: boolean }>
) {
  const normalInStock = dailySales.filter((d) => !d.outOfStock && !d.isPromo);
  const avgDailyDemand =
    normalInStock.length > 0
      ? normalInStock.reduce((s, d) => s + d.sold, 0) / normalInStock.length
      : 0;
  const stockoutDays = dailySales.filter((d) => d.outOfStock).length;
  const estimatedLostUnits = Math.round(stockoutDays * avgDailyDemand);
  const estimatedLostRevenueBdt = Math.round(estimatedLostUnits * unitPriceBdt);

  return {
    productName,
    normalAvgDailyDemand: Number(avgDailyDemand.toFixed(1)),
    stockoutDays,
    promoDaysExcluded: dailySales.filter((d) => d.isPromo).length,
    estimatedLostUnits,
    estimatedLostRevenueBdt,
    summaryBn: `গত মাসে ${productName} স্টকে না থাকায় (${stockoutDays} দিন) আনুমানিক ৳${estimatedLostRevenueBdt.toLocaleString()} বিক্রি হারিয়েছেন।`,
    summaryEn: `Stockouts on ${productName} (${stockoutDays} days) caused an estimated ৳${estimatedLostRevenueBdt.toLocaleString()} in lost sales last month.`,
  };
}

// #28: Weighted Supplier Quote Comparison (Price, Lead Time, Risk Score, Payment Terms)
export function rankSupplierQuotes(
  quotes: Array<{ name: string; unitPrice: number; leadDays: number; riskScore: number; creditDays: number }>
) {
  const minPrice = Math.min(...quotes.map((q) => q.unitPrice));
  return quotes
    .map((q) => {
      const pricePts = Math.round((minPrice / q.unitPrice) * 40);
      const speedPts = Math.max(5, 25 - q.leadDays * 4);
      const reliabilityPts = Math.round((q.riskScore / 100) * 25);
      const termsPts = Math.min(10, q.creditDays);
      return { ...q, weightedScore: pricePts + speedPts + reliabilityPts + termsPts };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);
}

// #31: Damaged Stock Supplier Claim Draft
export function buildSupplierDamageClaim(input: {
  supplierName: string;
  productName: string;
  qty: number;
  unitCostBdt: number;
  reason: 'BROKEN' | 'SPOILED' | 'EXPIRED';
  date: string;
}) {
  const claimAmountBdt = input.qty * input.unitCostBdt;
  const reasonBn = input.reason === 'BROKEN' ? 'ভাঙা' : input.reason === 'SPOILED' ? 'নষ্ট' : 'মেয়াদোত্তীর্ণ';
  return {
    claimAmountBdt,
    draftBn: `প্রিয় ${input.supplierName}, ${input.date} তারিখের চালানে ${input.qty}টি ${input.productName} (${reasonBn}) পাওয়া গেছে। মোট ক্ষতি ৳${claimAmountBdt} — পরবর্তী বিলে সমন্বয়/রিপ্লেসমেন্টের অনুরোধ করছি।`,
    draftEn: `Dear ${input.supplierName}, ${input.qty} units of ${input.productName} delivered on ${input.date} arrived ${input.reason.toLowerCase()}. Total claim: ৳${claimAmountBdt} for adjustment/replacement.`,
  };
}

// #32: Supplier Failure Cascading Impact (What-If Scenario)
export function simulateSupplierFailure(supplierName: string, outageDays: number) {
  const items = [
    { nameBn: 'মিনিকেট চাল (৫ কেজি)', nameEn: 'Miniket Rice (5kg)', stock: 40, dailySales: 13, price: 360 },
    { nameBn: 'সয়াবিন তেল (২ লিটার)', nameEn: 'Soybean Oil (2L)', stock: 38, dailySales: 7.5, price: 350 },
  ];
  const affected = items.map((it) => {
    const daysUntilOut = Math.max(1, Math.floor(it.stock / it.dailySales));
    const uncoveredDays = Math.max(0, outageDays - daysUntilOut);
    const estLossBdt = Math.round(uncoveredDays * it.dailySales * it.price);
    return { ...it, daysUntilOut, uncoveredDays, estLossBdt };
  });
  const totalEstLossBdt = affected.reduce((s, x) => s + x.estLossBdt, 0);
  return { supplierName, outageDays, affected, totalEstLossBdt };
}

// #34: Tamper-Evident SHA-256 Hash-Chain Audit Log (Honestly labeled Tamper-Evident, NOT Immutable)
export interface HashChainEntry {
  index: number;
  timestamp: string;
  actor: string;
  agentToolScope: string;
  action: string;
  prevHash: string;
  hash: string;
}

export function computeEntryHash(entry: Omit<HashChainEntry, 'hash'>): string {
  return crypto
    .createHash('sha256')
    .update(`${entry.index}|${entry.timestamp}|${entry.actor}|${entry.agentToolScope}|${entry.action}|${entry.prevHash}`)
    .digest('hex')
    .slice(0, 16);
}

export function verifyHashChain(chain: HashChainEntry[]): { valid: boolean; brokenAtIndex: number | null } {
  for (let i = 0; i < chain.length; i++) {
    const cur = chain[i];
    if (i > 0 && cur.prevHash !== chain[i - 1].hash) {
      return { valid: false, brokenAtIndex: i };
    }
    const expected = computeEntryHash({
      index: cur.index,
      timestamp: cur.timestamp,
      actor: cur.actor,
      agentToolScope: cur.agentToolScope,
      action: cur.action,
      prevHash: cur.prevHash,
    });
    if (cur.hash !== expected) {
      return { valid: false, brokenAtIndex: i };
    }
  }
  return { valid: true, brokenAtIndex: null };
}

// #36: Simple 70/30 Order Split Recommendation for Risky Suppliers
export function computeOrderSplit(supplierRiskScore: number, totalQty: number, primarySupplier: string, backupSupplier: string) {
  if (supplierRiskScore < 70) {
    const mainQty = Math.round(totalQty * 0.7);
    const backupQty = totalQty - mainQty;
    return { splitRecommended: true, mainSupplier: primarySupplier, mainQty, backupSupplier, backupQty };
  }
  return { splitRecommended: false, mainSupplier: primarySupplier, mainQty: totalQty, backupSupplier: null, backupQty: 0 };
}
