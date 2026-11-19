/**
 * BizMind AI — 90-Day Deterministic Backtest Engine
 * Proves "Revenue Up, Stockouts Down" by simulating Policy A (Manual Reorder)
 * vs Policy B (BizMind AI Reorder + Expiry Rescue) on 90 days of synthetic retail data.
 */

export interface BacktestSummary {
  datasetLabel: string;
  daysSimulated: number;
  manual: {
    revenueBdt: number;
    stockoutDays: number;
    expiredUnits: number;
    wasteLossBdt: number;
  };
  bizmind: {
    revenueBdt: number;
    stockoutDays: number;
    expiredUnits: number;
    wasteLossBdt: number;
  };
  improvements: {
    stockoutReductionPct: number;
    wasteReductionPct: number;
    extraRevenueBdt: number;
  };
  weeklySeries: Array<{ week: string; manualRev: number; bizmindRev: number }>;
}

export function run90DayBacktest(): BacktestSummary {
  const days = 90;
  // Deterministic pseudo-demand with weekend + festival spikes
  let manualStock = 45;
  let aiStock = 45;
  let manualRev = 0;
  let aiRev = 0;
  let manualStockoutDays = 0;
  let aiStockoutDays = 0;
  let manualExpired = 0;
  let aiExpired = 0;

  const weeklySeries: Array<{ week: string; manualRev: number; bizmindRev: number }> = [];
  let wkManual = 0;
  let wkAi = 0;

  for (let day = 1; day <= days; day++) {
    const isWeekend = day % 7 === 5 || day % 7 === 6;
    const isFestivalWeek = day >= 58 && day <= 66;
    const demand = Math.round((14 + (day % 5) * 2) * (isWeekend ? 1.35 : 1) * (isFestivalWeek ? 1.65 : 1));
    const unitPrice = 180;

    // Policy A: Manual — only reorders fixed 60 units when stock drops below 10 (late!)
    if (manualStock < 10) {
      manualStock += 60;
    }
    const manualSold = Math.min(manualStock, demand);
    if (manualSold < demand) manualStockoutDays += 1;
    manualStock -= manualSold;
    // Periodic expiry waste on slow weekdays without dynamic discounting
    if (day % 9 === 0 && manualStock > 12) {
      const wasted = Math.min(6, manualStock - 8);
      manualExpired += wasted;
      manualStock -= wasted;
    }
    const dayManualRev = manualSold * unitPrice;
    manualRev += dayManualRev;
    wkManual += dayManualRev;

    // Policy B: BizMind AI — proactive ROP + festival multiplier + expiry discount rescue
    const targetRop = isFestivalWeek ? 42 : 24;
    if (aiStock < targetRop) {
      aiStock += isFestivalWeek ? 75 : 50;
    }
    const aiSold = Math.min(aiStock, demand);
    if (aiSold < demand) aiStockoutDays += 1;
    aiStock -= aiSold;
    // Expiry rescue clears 70% of at-risk units at 15% discount instead of wasting them
    let rescueRev = 0;
    if (day % 9 === 0 && aiStock > 12) {
      const atRisk = Math.min(6, aiStock - 8);
      const rescued = Math.round(atRisk * 0.72);
      const wasted = atRisk - rescued;
      aiExpired += wasted;
      aiStock -= atRisk;
      rescueRev = Math.round(rescued * unitPrice * 0.85);
    }
    const dayAiRev = aiSold * unitPrice + rescueRev;
    aiRev += dayAiRev;
    wkAi += dayAiRev;

    if (day % 15 === 0) {
      weeklySeries.push({
        week: `D${day - 14}-${day}`,
        manualRev: wkManual,
        bizmindRev: wkAi,
      });
      wkManual = 0;
      wkAi = 0;
    }
  }

  const unitCost = 140;
  const stockoutReductionPct = manualStockoutDays > 0
    ? Math.round(((manualStockoutDays - aiStockoutDays) / manualStockoutDays) * 100)
    : 0;
  const wasteReductionPct = manualExpired > 0
    ? Math.round(((manualExpired - aiExpired) / manualExpired) * 100)
    : 0;
  const extraRevenueBdt = Math.max(0, aiRev - manualRev);

  return {
    datasetLabel: '90-Day Synthetic Retail Demo Dataset (Bangladeshi Grocery Store)',
    daysSimulated: days,
    manual: {
      revenueBdt: manualRev,
      stockoutDays: manualStockoutDays,
      expiredUnits: manualExpired,
      wasteLossBdt: manualExpired * unitCost,
    },
    bizmind: {
      revenueBdt: aiRev,
      stockoutDays: aiStockoutDays,
      expiredUnits: aiExpired,
      wasteLossBdt: aiExpired * unitCost,
    },
    improvements: {
      stockoutReductionPct,
      wasteReductionPct,
      extraRevenueBdt,
    },
    weeklySeries,
  };
}
