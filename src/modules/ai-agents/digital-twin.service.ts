/**
 * BizMind AI — Digital Twin "What-If" Simulator with Transparent Assumptions
 */

export interface WhatIfInput {
  rainyDays: number;          // 0 to 5 days
  sugarPriceChangePct: number; // -10 to +25 %
  eidStockBoostPct: number;    // 0 to +80 %
}

export interface WhatIfResult {
  baselineRevenueBdt: number;
  projectedRevenueBdt: number;
  baselineProfitBdt: number;
  projectedProfitBdt: number;
  stockoutRiskPct: number;
  assumptions: string[];
  dailyProjection: Array<{ day: string; baseline: number; simulated: number }>;
}

export function runDigitalTwinSimulation(input: WhatIfInput): WhatIfResult {
  const rainy = Math.max(0, Math.min(5, Number(input.rainyDays || 0)));
  const sugarDelta = Math.max(-10, Math.min(25, Number(input.sugarPriceChangePct || 0)));
  const eidBoost = Math.max(0, Math.min(80, Number(input.eidStockBoostPct || 0)));

  const baseDailyRev = 14500;
  const baseMargin = 0.14;

  // Transparent model coefficients
  const rainFootfallImpact = -0.05 * rainy;   // -5% walk-in traffic per rainy day
  const rainUmbrellaTeaLift = 0.035 * rainy;  // +3.5% umbrella/tea/snacks bundle lift per rainy day
  const eidDemandCapture = 0.0045 * eidBoost; // capturing pre-Eid demand up to +36%
  const marginShift = -0.002 * sugarDelta;    // wholesale sugar hike compresses margin unless repriced

  const netRevMultiplier = Math.max(0.7, 1 + rainFootfallImpact + rainUmbrellaTeaLift + eidDemandCapture);
  const effectiveMargin = Math.max(0.06, baseMargin + marginShift);

  const dailyProjection = [];
  let baselineRevenueBdt = 0;
  let projectedRevenueBdt = 0;

  for (let d = 1; d <= 7; d++) {
    const dayBase = Math.round(baseDailyRev * (d >= 5 ? 1.2 : 1));
    const daySim = Math.round(dayBase * netRevMultiplier);
    baselineRevenueBdt += dayBase;
    projectedRevenueBdt += daySim;
    dailyProjection.push({ day: `Day ${d}`, baseline: dayBase, simulated: daySim });
  }

  const baselineProfitBdt = Math.round(baselineRevenueBdt * baseMargin);
  const projectedProfitBdt = Math.round(projectedRevenueBdt * effectiveMargin);
  const stockoutRiskPct = Math.max(4, Math.min(68, Math.round(28 - eidBoost * 0.3 + rainy * 2)));

  const assumptions = [
    `Rain impact (${rainy}d): Umbrella/Tea/Snacks +40% category lift, general walk-in traffic -5%/day.`,
    `Commodity shock (Sugar ${sugarDelta >= 0 ? '+' : ''}${sugarDelta}%): Margin shifts ${(marginShift * 100).toFixed(1)}% assuming partial pass-through.`,
    `Pre-Eid inventory boost (+${eidBoost}%): Captures peak demand and reduces stockout probability to ${stockoutRiskPct}%.`,
  ];

  return {
    baselineRevenueBdt,
    projectedRevenueBdt,
    baselineProfitBdt,
    projectedProfitBdt,
    stockoutRiskPct,
    assumptions,
    dailyProjection,
  };
}
