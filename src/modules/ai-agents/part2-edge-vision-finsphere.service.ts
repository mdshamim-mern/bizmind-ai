/**
 * BizMind AI — Part 2 Services:
 * 7. Vision Chalan OCR & Barcode Lookup (honest scope, no full-shelf counting)
 * 8. In-Browser / Edge Holt-Winters Forecast
 * 9. Autonomous Marketing Drafts (Waste Rescue -> Combo + SMS/FB + Banner spec)
 * 10. FinSphere SME Capital Credit-Readiness Simulation (explicitly Simulation Only)
 */

export const BARCODE_CATALOG: Record<string, { sku: string; nameBn: string; nameEn: string; cost: number; price: number }> = {
  '8941100100012': { sku: 'EGG-RED-12', nameBn: 'ফার্মের লাল ডিম (১ ডজন)', nameEn: 'Brown Farm Eggs (12 pcs)', cost: 120, price: 150 },
  '8941100200029': { sku: 'OIL-SOY-2L', nameBn: 'সয়াবিন তেল (২ লিটার)', nameEn: 'Soybean Oil (2L)', cost: 325, price: 350 },
  '8941100300036': { sku: 'RICE-MIN-5K', nameBn: 'মিনিকেট চাল (৫ কেজি)', nameEn: 'Miniket Rice (5kg)', cost: 330, price: 360 },
  '8941100400043': { sku: 'MILK-LIQ-1L', nameBn: 'তরল দুধ (১ লিটার)', nameEn: 'Liquid Milk (1L)', cost: 80, price: 95 },
  '8941100500050': { sku: 'SUGAR-WHT-1K', nameBn: 'সাদা চিনি (১ কেজি)', nameEn: 'White Sugar (1kg)', cost: 118, price: 135 },
};

export interface FinSphereSimulationInput {
  sixMonthAvgMonthlySalesBdt: number;
  bakiRecoveryRatePct: number; // 0 to 100
  cashOnHandBdt: number;
  requiredFestivalStockBdt: number;
}

export function simulateFinSphereCreditReadiness(input: FinSphereSimulationInput) {
  const salesScore = Math.min(45, Math.round((input.sixMonthAvgMonthlySalesBdt / 250000) * 45));
  const recoveryScore = Math.min(35, Math.round((input.bakiRecoveryRatePct / 100) * 35));
  const liquidityRatio = input.requiredFestivalStockBdt > 0 ? input.cashOnHandBdt / input.requiredFestivalStockBdt : 1;
  const liquidityScore = Math.min(20, Math.round(Math.min(1, liquidityRatio) * 20));
  const creditReadinessScore = Math.min(100, salesScore + recoveryScore + liquidityScore);

  const workingCapitalGapBdt = Math.max(0, input.requiredFestivalStockBdt - input.cashOnHandBdt);
  const tier = creditReadinessScore >= 75 ? 'STRONG' : creditReadinessScore >= 50 ? 'MODERATE' : 'BUILDING';

  return {
    simulationOnly: true,
    disclaimer: 'SIMULATION ONLY: AI does not issue real loans or binding financial commitments.',
    creditReadinessScore,
    tier,
    workingCapitalGapBdt,
    breakdown: { salesScore, recoveryScore, liquidityScore },
    supplierCreditDraftBn:
      `প্রিয় মেঘনা ট্রেডার্স,\nআসন্ন ঈদ উপলক্ষে আমাদের দোকানে অতিরিক্ত ৳${input.requiredFestivalStockBdt.toLocaleString()} টাকার পণ্য প্রয়োজন। ` +
      `বর্তমানে নগদ ৳${input.cashOnHandBdt.toLocaleString()} প্রদান করে বাকি ৳${workingCapitalGapBdt.toLocaleString()} টাকা ৭ দিনের ক্রেডিটে নেওয়ার অনুরোধ করছি। ` +
      `আমাদের ৬ মাসের গড় বিক্রি ও ${input.bakiRecoveryRatePct}% বাকি আদায়ের ভিত্তিতে ক্রেডিট-রেডিনেস স্কোর ${creditReadinessScore}/১০০ (সিমুলেশন)।`,
    supplierCreditDraftEn:
      `Dear Meghna Traders,\nAhead of Eid demand, we need ৳${input.requiredFestivalStockBdt.toLocaleString()} in stock. ` +
      `We can pay ৳${input.cashOnHandBdt.toLocaleString()} upfront and request ৳${workingCapitalGapBdt.toLocaleString()} on 7-day supplier trade credit. ` +
      `Our 6-month sales & ${input.bakiRecoveryRatePct}% recovery rate give a Credit-Readiness Score of ${creditReadinessScore}/100 (Simulation).`,
  };
}

export function buildWasteMarketingBundle(productNameBn: string, productNameEn: string, qty: number, discPrice: number) {
  return {
    comboOfferBn: `🔥 সুপার সেভার কম্বো: ${productNameBn} + ১ লিটার তরল দুধ একসাথে কিনলে ১৫% বিশেষ ছাড়!`,
    comboOfferEn: `🔥 Super Saver Combo: Buy ${productNameEn} + 1L Liquid Milk together for 15% instant off!`,
    facebookPostBn: `📢 আজকের বিশেষ অফার — রহিম ভাইয়ের মুদি দোকান!\nতাজা ${productNameBn} (${qty}টি সীমিত স্টক) আজ পাচ্ছেন মাত্র ৳${discPrice} টাকায় (১৫% ছাড়)!\nআজই চলে আসুন অথবা ইনবক্সে অর্ডার করুন।`,
    facebookPostEn: `📢 Today's Flash Deal — Rahim's Grocery Store!\nFresh ${productNameEn} (${qty} limited stock) now only ৳${discPrice} (15% off)!\nVisit today or message us to reserve.`,
    smsCopyBn: `বিশেষ ছাড়! রহিম ভাইয়ের দোকানে আজ ${productNameBn} মাত্র ৳${discPrice} (১৫% ছাড়)। স্টক সীমিত!`,
    smsCopyEn: `Flash Deal! ${productNameEn} only ৳${discPrice} (15% off) today at Rahim's Grocery. Limited stock!`,
  };
}
