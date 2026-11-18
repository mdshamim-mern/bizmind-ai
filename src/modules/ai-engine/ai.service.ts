import prisma from '../../shared/prisma';

export type ProductClassification =
  | 'STAR'
  | 'VOLUME'
  | 'PREMIUM'
  | 'SLOW_MOVING'
  | 'DEAD_STOCK';

export type TrendDirection = 'UPWARD' | 'STABLE' | 'DOWNWARD';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type DashboardPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface ProductPerformanceResult {
  productId: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  unitsSold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMarginPct: number;
  salesVelocity: number;
  revenueContributionPct: number;
  stockTurnover: number;
  daysOfInventory: number;
  sellThroughRatePct: number;
  classification: ProductClassification;
  aiRecommendation: string;
}

export interface DemandForecastResult {
  productId: string;
  sku: string;
  name: string;
  weeklySales: number[];
  movingAverage: number;
  weightedMovingAverage: number;
  exponentialSmoothing: number;
  predictedWeeklyQty: number;
  predictedDailyQty: number;
  trend: TrendDirection;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number;
  maeScore: number;
}

export interface RestockRecommendationResult {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  currentStock: number;
  incomingStock: number;
  dailyDemand: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  recommendedOrderQty: number;
  estimatedOrderCost: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'OK';
}

export interface DiscountScenario {
  strategy:
    | 'NORMAL_PRICE'
    | 'DISCOUNT_10_PCT'
    | 'DISCOUNT_20_PCT'
    | 'BUY_TWO_GET_ONE'
    | 'BOGO';
  label: string;
  unitsInBundle: number;
  bundlePrice: number;
  bundleCost: number;
  effectiveUnitPrice: number;
  grossProfitPerBundle: number;
  marginPct: number;
  meetsMinPriceProtection: boolean;
}

export interface DiscountRecommendationResult {
  productId: string;
  sku: string;
  name: string;
  currentStock: number;
  costPrice: number;
  sellingPrice: number;
  minSellingPrice: number;
  reason: 'SLOW_MOVING' | 'NEAR_EXPIRY' | 'BOTH';
  nearestExpiryDate: Date | null;
  daysUntilExpiry: number | null;
  recommendedStrategy: DiscountScenario;
  scenarios: DiscountScenario[];
}

const round2 = (val: number): number => Math.round(val * 100) / 100;

const getDateRange = (
  period: DashboardPeriod = 'MONTHLY',
  customStart?: string,
  customEnd?: string
): { startDate: Date; endDate: Date; periodDays: number } => {
  const endDate = customEnd ? new Date(customEnd) : new Date();
  let startDate: Date;

  if (period === 'CUSTOM' && customStart) {
    startDate = new Date(customStart);
  } else if (period === 'DAILY') {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);
  } else if (period === 'WEEKLY') {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);
  } else {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
  }

  const diffMs = Math.max(endDate.getTime() - startDate.getTime(), 86400000);
  const periodDays = Math.max(1, Math.ceil(diffMs / 86400000));
  return { startDate, endDate, periodDays };
};

const classifyProduct = (
  unitsSold: number,
  salesVelocity: number,
  profitMarginPct: number,
  daysOfInventory: number,
  avgVelocity: number,
  avgMargin: number
): { classification: ProductClassification; aiRecommendation: string } => {
  if (unitsSold === 0) {
    return {
      classification: 'DEAD_STOCK',
      aiRecommendation:
        'Zero sales in the period. Run clearance discounts, bundle offers, or discontinue future reorders.',
    };
  }

  const isHighVelocity = salesVelocity >= Math.max(avgVelocity, 0.5);
  const isHighMargin = profitMarginPct >= Math.max(avgMargin, 20);

  if (isHighVelocity && isHighMargin) {
    return {
      classification: 'STAR',
      aiRecommendation:
        'Top performer with strong demand and high margin. Maintain optimal safety stock and prioritize shelf visibility.',
    };
  }

  if (isHighVelocity && !isHighMargin) {
    return {
      classification: 'VOLUME',
      aiRecommendation:
        'High sales volume with tighter margins. Negotiate supplier bulk discounts or pair with high-margin add-ons.',
    };
  }

  if (!isHighVelocity && isHighMargin && daysOfInventory <= 60) {
    return {
      classification: 'PREMIUM',
      aiRecommendation:
        'High-margin niche item. Promote via targeted upselling and loyalty campaigns to boost velocity.',
    };
  }

  return {
    classification: 'SLOW_MOVING',
    aiRecommendation:
      'Low turnover or excess days of inventory. Apply controlled promotional pricing and pause restocking.',
  };
};

export const analyzeProductPerformance = async (
  shopId: string,
  periodDays = 30,
  startDate?: Date,
  endDate?: Date
): Promise<ProductPerformanceResult[]> => {
  const end = endDate ?? new Date();
  const start =
    startDate ?? new Date(end.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: { shopId },
    include: {
      category: true,
      batches: true,
      saleItems: {
        where: {
          sale: {
            soldAt: {
              gte: start,
              lte: end,
            },
          },
        },
      },
    },
  });

  const rawMetrics = products.map((product) => {
    const costPrice = Number(product.costPrice);
    const sellingPrice = Number(product.sellingPrice);
    const currentStock = product.batches.reduce(
      (sum, b) => sum + b.quantity,
      0
    );

    const unitsSold = product.saleItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const totalRevenue = product.saleItems.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0
    );
    const totalCost = unitsSold * costPrice;
    const totalProfit = totalRevenue - totalCost;
    const profitMarginPct =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const salesVelocity = unitsSold / Math.max(periodDays, 1);

    const avgInventory = (currentStock + (currentStock + unitsSold)) / 2;
    const stockTurnover = avgInventory > 0 ? unitsSold / avgInventory : 0;
    const daysOfInventory =
      salesVelocity > 0
        ? currentStock / salesVelocity
        : currentStock > 0
          ? 999
          : 0;
    const sellThroughRatePct =
      unitsSold + currentStock > 0
        ? (unitsSold / (unitsSold + currentStock)) * 100
        : 0;

    return {
      product,
      costPrice,
      sellingPrice,
      currentStock,
      unitsSold,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMarginPct,
      salesVelocity,
      stockTurnover,
      daysOfInventory,
      sellThroughRatePct,
    };
  });

  const totalShopRevenue = rawMetrics.reduce(
    (sum, m) => sum + m.totalRevenue,
    0
  );
  const activeMetrics = rawMetrics.filter((m) => m.unitsSold > 0);
  const avgVelocity =
    activeMetrics.length > 0
      ? activeMetrics.reduce((s, m) => s + m.salesVelocity, 0) /
        activeMetrics.length
      : 0;
  const avgMargin =
    activeMetrics.length > 0
      ? activeMetrics.reduce((s, m) => s + m.profitMarginPct, 0) /
        activeMetrics.length
      : 0;

  return rawMetrics
    .map((m) => {
      const revenueContributionPct =
        totalShopRevenue > 0 ? (m.totalRevenue / totalShopRevenue) * 100 : 0;
      const { classification, aiRecommendation } = classifyProduct(
        m.unitsSold,
        m.salesVelocity,
        m.profitMarginPct,
        m.daysOfInventory,
        avgVelocity,
        avgMargin
      );

      return {
        productId: m.product.id,
        sku: m.product.sku,
        name: m.product.name,
        category: m.product.category?.name ?? null,
        unit: m.product.unit,
        costPrice: round2(m.costPrice),
        sellingPrice: round2(m.sellingPrice),
        currentStock: m.currentStock,
        unitsSold: m.unitsSold,
        totalRevenue: round2(m.totalRevenue),
        totalCost: round2(m.totalCost),
        totalProfit: round2(m.totalProfit),
        profitMarginPct: round2(m.profitMarginPct),
        salesVelocity: round2(m.salesVelocity),
        revenueContributionPct: round2(revenueContributionPct),
        stockTurnover: round2(m.stockTurnover),
        daysOfInventory: round2(m.daysOfInventory),
        sellThroughRatePct: round2(m.sellThroughRatePct),
        classification,
        aiRecommendation,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
};

export const generateDemandForecasts = async (
  shopId: string
): Promise<DemandForecastResult[]> => {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: { shopId },
    include: {
      saleItems: {
        where: {
          sale: {
            soldAt: {
              gte: fourWeeksAgo,
              lte: now,
            },
          },
        },
        include: {
          sale: {
            select: { soldAt: true },
          },
        },
      },
    },
  });

  const weights = [0.1, 0.2, 0.3, 0.4];
  const alpha = 0.35;

  return products.map((product) => {
    const weeklySales = [0, 0, 0, 0];

    for (const item of product.saleItems) {
      const daysAgo = Math.floor(
        (now.getTime() - item.sale.soldAt.getTime()) / (24 * 60 * 60 * 1000)
      );
      const weekIndex = Math.min(3, Math.max(0, 3 - Math.floor(daysAgo / 7)));
      weeklySales[weekIndex] += item.quantity;
    }

    const movingAverage =
      weeklySales.reduce((sum, q) => sum + q, 0) / weeklySales.length;

    const weightedMovingAverage = weeklySales.reduce(
      (sum, q, idx) => sum + q * weights[idx],
      0
    );

    let smoothed = weeklySales[0];
    const errors: number[] = [];
    for (let i = 1; i < weeklySales.length; i++) {
      errors.push(Math.abs(weeklySales[i] - smoothed));
      smoothed = alpha * weeklySales[i] + (1 - alpha) * smoothed;
    }
    const exponentialSmoothing = smoothed;

    const maeScore =
      errors.length > 0
        ? errors.reduce((sum, e) => sum + e, 0) / errors.length
        : 0;

    const earlyAvg = (weeklySales[0] + weeklySales[1]) / 2;
    const recentAvg = (weeklySales[2] + weeklySales[3]) / 2;
    let trend: TrendDirection = 'STABLE';
    if (earlyAvg === 0 && recentAvg > 0) {
      trend = 'UPWARD';
    } else if (earlyAvg > 0) {
      const changePct = ((recentAvg - earlyAvg) / earlyAvg) * 100;
      if (changePct > 10) trend = 'UPWARD';
      else if (changePct < -10) trend = 'DOWNWARD';
    }

    const predictedWeeklyQty = Math.max(
      0,
      Math.round(
        (movingAverage + weightedMovingAverage + exponentialSmoothing) / 3
      )
    );
    const predictedDailyQty = predictedWeeklyQty / 7;

    const relativeError =
      movingAverage > 0 ? maeScore / movingAverage : maeScore > 0 ? 1 : 0.5;
    let confidenceLevel: ConfidenceLevel = 'LOW';
    let confidenceScore = 0.5;

    if (movingAverage > 0 && relativeError <= 0.25) {
      confidenceLevel = 'HIGH';
      confidenceScore = 0.88;
    } else if (movingAverage > 0 && relativeError <= 0.5) {
      confidenceLevel = 'MEDIUM';
      confidenceScore = 0.7;
    } else {
      confidenceLevel = 'LOW';
      confidenceScore = 0.45;
    }

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      weeklySales,
      movingAverage: round2(movingAverage),
      weightedMovingAverage: round2(weightedMovingAverage),
      exponentialSmoothing: round2(exponentialSmoothing),
      predictedWeeklyQty,
      predictedDailyQty: round2(predictedDailyQty),
      trend,
      confidenceLevel,
      confidenceScore,
      maeScore: round2(maeScore),
    };
  });
};

export const getRestockingRecommendations = async (
  shopId: string,
  leadTimeDays = 7
): Promise<RestockRecommendationResult[]> => {
  const [forecasts, products, pendingPurchases] = await Promise.all([
    generateDemandForecasts(shopId),
    prisma.product.findMany({
      where: { shopId },
      include: { batches: true },
    }),
    prisma.purchase.findMany({
      where: {
        shopId,
        status: { in: ['PENDING', 'ORDERED'] },
      },
      include: { items: true },
    }),
  ]);

  const forecastMap = new Map(forecasts.map((f) => [f.productId, f]));
  const incomingStockMap = new Map<string, number>();

  for (const purchase of pendingPurchases) {
    for (const item of purchase.items) {
      incomingStockMap.set(
        item.productId,
        (incomingStockMap.get(item.productId) ?? 0) + item.quantity
      );
    }
  }

  return products
    .map((product) => {
      const forecast = forecastMap.get(product.id);
      const dailyDemand = forecast?.predictedDailyQty ?? 0;
      const currentStock = product.batches.reduce(
        (sum, b) => sum + b.quantity,
        0
      );
      const incomingStock = incomingStockMap.get(product.id) ?? 0;
      const safetyStock = Math.max(
        product.reorderLevel,
        Math.ceil(dailyDemand * 3)
      );

      // Core formula: ROP = (D * L) + SS and Q = max(0, ROP - S - I)
      const reorderPoint = Math.ceil(dailyDemand * leadTimeDays + safetyStock);
      const recommendedOrderQty = Math.max(
        0,
        Math.ceil(reorderPoint - currentStock - incomingStock)
      );

      const costPrice = Number(product.costPrice);
      const estimatedOrderCost = recommendedOrderQty * costPrice;

      let urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'OK' = 'OK';
      if (currentStock === 0 && recommendedOrderQty > 0) {
        urgency = 'CRITICAL';
      } else if (currentStock + incomingStock <= safetyStock && recommendedOrderQty > 0) {
        urgency = 'HIGH';
      } else if (recommendedOrderQty > 0) {
        urgency = 'MEDIUM';
      }

      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        currentStock,
        incomingStock,
        dailyDemand: round2(dailyDemand),
        leadTimeDays,
        safetyStock,
        reorderPoint,
        recommendedOrderQty,
        estimatedOrderCost: round2(estimatedOrderCost),
        urgency,
      };
    })
    .sort((a, b) => b.recommendedOrderQty - a.recommendedOrderQty);
};

export const getDiscountRecommendations = async (
  shopId: string,
  expiryWindowDays = 30
): Promise<DiscountRecommendationResult[]> => {
  const now = new Date();
  const expiryCutoff = new Date(
    now.getTime() + expiryWindowDays * 24 * 60 * 60 * 1000
  );

  const [performanceList, products] = await Promise.all([
    analyzeProductPerformance(shopId, 30),
    prisma.product.findMany({
      where: { shopId },
      include: {
        batches: {
          where: { quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
        },
      },
    }),
  ]);

  const perfMap = new Map(performanceList.map((p) => [p.productId, p]));
  const results: DiscountRecommendationResult[] = [];

  for (const product of products) {
    const currentStock = product.batches.reduce(
      (sum, b) => sum + b.quantity,
      0
    );
    if (currentStock <= 0) continue;

    const perf = perfMap.get(product.id);
    const isSlowMoving =
      perf?.classification === 'SLOW_MOVING' ||
      perf?.classification === 'DEAD_STOCK';

    const expiringBatch = product.batches.find(
      (b) => b.expiryDate !== null && b.expiryDate <= expiryCutoff
    );
    const isNearExpiry = Boolean(expiringBatch);

    if (!isSlowMoving && !isNearExpiry) continue;

    const costPrice = Number(product.costPrice);
    const sellingPrice = Number(product.sellingPrice);
    const minSellingPrice = costPrice;

    const buildScenario = (
      strategy: DiscountScenario['strategy'],
      label: string,
      unitsInBundle: number,
      bundlePrice: number
    ): DiscountScenario => {
      const bundleCost = unitsInBundle * costPrice;
      const effectiveUnitPrice = bundlePrice / unitsInBundle;
      const grossProfitPerBundle = bundlePrice - bundleCost;
      const marginPct =
        bundlePrice > 0 ? (grossProfitPerBundle / bundlePrice) * 100 : 0;
      const meetsMinPriceProtection = effectiveUnitPrice >= minSellingPrice;

      return {
        strategy,
        label,
        unitsInBundle,
        bundlePrice: round2(bundlePrice),
        bundleCost: round2(bundleCost),
        effectiveUnitPrice: round2(effectiveUnitPrice),
        grossProfitPerBundle: round2(grossProfitPerBundle),
        marginPct: round2(marginPct),
        meetsMinPriceProtection,
      };
    };

    const scenarios: DiscountScenario[] = [
      buildScenario('NORMAL_PRICE', 'Normal Price', 1, sellingPrice),
      buildScenario('DISCOUNT_10_PCT', '10% Discount', 1, sellingPrice * 0.9),
      buildScenario('DISCOUNT_20_PCT', '20% Discount', 1, sellingPrice * 0.8),
      buildScenario(
        'BUY_TWO_GET_ONE',
        'Buy Two Get One (3 units)',
        3,
        sellingPrice * 2
      ),
      buildScenario('BOGO', 'Buy One Get One (2 units)', 2, sellingPrice),
    ];

    const safeDiscounts = scenarios.filter(
      (s) => s.strategy !== 'NORMAL_PRICE' && s.meetsMinPriceProtection
    );
    const recommendedStrategy =
      safeDiscounts.length > 0
        ? safeDiscounts[safeDiscounts.length - 1]
        : scenarios[0];

    const nearestExpiryDate = expiringBatch?.expiryDate ?? null;
    const daysUntilExpiry = nearestExpiryDate
      ? Math.ceil(
          (nearestExpiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        )
      : null;

    results.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentStock,
      costPrice: round2(costPrice),
      sellingPrice: round2(sellingPrice),
      minSellingPrice: round2(minSellingPrice),
      reason:
        isSlowMoving && isNearExpiry
          ? 'BOTH'
          : isNearExpiry
            ? 'NEAR_EXPIRY'
            : 'SLOW_MOVING',
      nearestExpiryDate,
      daysUntilExpiry,
      recommendedStrategy,
      scenarios,
    });
  }

  return results;
};

export const getBusinessIntelligenceDashboard = async (
  shopId: string,
  period: DashboardPeriod = 'MONTHLY',
  customStart?: string,
  customEnd?: string
) => {
  const { startDate, endDate, periodDays } = getDateRange(
    period,
    customStart,
    customEnd
  );
  const now = new Date();
  const expiryCutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    sales,
    expenses,
    batches,
    adjustments,
    productPerformance,
    demandForecasts,
    restockingRecommendations,
    discountOpportunities,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        soldAt: { gte: startDate, lte: endDate },
      },
      include: { items: true },
    }),
    prisma.expense.findMany({
      where: {
        shopId,
        incurredAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.inventoryBatch.findMany({
      where: {
        shopId,
        quantity: { gt: 0 },
      },
      include: {
        product: {
          select: { id: true, sku: true, name: true, sellingPrice: true },
        },
      },
      orderBy: { expiryDate: 'asc' },
    }),
    prisma.stockAdjustment.findMany({
      where: {
        shopId,
        type: { in: ['DAMAGE', 'LOSS'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        product: {
          select: { id: true, sku: true, name: true, costPrice: true },
        },
      },
    }),
    analyzeProductPerformance(shopId, periodDays, startDate, endDate),
    generateDemandForecasts(shopId),
    getRestockingRecommendations(shopId),
    getDiscountRecommendations(shopId),
  ]);

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const totalSalesCount = sales.length;
  const totalUnitsSold = sales.reduce(
    (sum, s) => sum + s.items.reduce((iSum, item) => iSum + item.quantity, 0),
    0
  );
  const totalCost = productPerformance.reduce((sum, p) => sum + p.totalCost, 0);
  const grossProfit = totalRevenue - totalCost;
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;
  const profitMarginPct =
    totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const totalInventoryValue = batches.reduce(
    (sum, b) => sum + Number(b.costPrice) * b.quantity,
    0
  );

  const bestPerformingProducts = productPerformance
    .filter((p) => ['STAR', 'VOLUME', 'PREMIUM'].includes(p.classification))
    .slice(0, 10);

  const slowMovingProducts = productPerformance.filter((p) =>
    ['SLOW_MOVING', 'DEAD_STOCK'].includes(p.classification)
  );

  const expiringInventory = batches
    .filter((b) => b.expiryDate !== null && b.expiryDate <= expiryCutoff)
    .map((b) => {
      const daysUntilExpiry = b.expiryDate
        ? Math.ceil(
            (b.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          )
        : 0;
      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        productId: b.productId,
        sku: b.product.sku,
        productName: b.product.name,
        quantity: b.quantity,
        expiryDate: b.expiryDate,
        daysUntilExpiry,
        atRiskValue: round2(Number(b.costPrice) * b.quantity),
      };
    });

  const totalLossQty = adjustments.reduce(
    (sum, a) => sum + Math.abs(a.quantity),
    0
  );
  const totalLossValue = adjustments.reduce(
    (sum, a) => sum + Math.abs(a.quantity) * Number(a.product.costPrice),
    0
  );

  const inventoryLossSummary = {
    totalAdjustments: adjustments.length,
    totalUnitsLost: totalLossQty,
    totalLossValue: round2(totalLossValue),
    byType: {
      DAMAGE: adjustments.filter((a) => a.type === 'DAMAGE').length,
      LOSS: adjustments.filter((a) => a.type === 'LOSS').length,
    },
    recentLosses: adjustments.slice(0, 10).map((a) => ({
      id: a.id,
      productId: a.productId,
      productName: a.product.name,
      type: a.type,
      quantity: a.quantity,
      estimatedLoss: round2(Math.abs(a.quantity) * Number(a.product.costPrice)),
      reason: a.reason,
      createdAt: a.createdAt,
    })),
  };

  const criticalRestocks = restockingRecommendations.filter(
    (r) => r.recommendedOrderQty > 0
  );

  const aiBusinessObservations: string[] = [];
  if (bestPerformingProducts.length > 0) {
    const top = bestPerformingProducts[0];
    aiBusinessObservations.push(
      `Top revenue driver is "${top.name}" contributing ${top.revenueContributionPct}% of revenue with ${top.profitMarginPct}% margin.`
    );
  }
  if (criticalRestocks.length > 0) {
    aiBusinessObservations.push(
      `${criticalRestocks.length} product(s) are below reorder point and require restocking.`
    );
  }
  if (expiringInventory.length > 0) {
    aiBusinessObservations.push(
      `${expiringInventory.length} inventory batch(es) are expiring within 30 days. Consider promotional discounts.`
    );
  }
  if (slowMovingProducts.length > 0) {
    aiBusinessObservations.push(
      `${slowMovingProducts.length} product(s) are classified as slow-moving or dead stock, tying up working capital.`
    );
  }
  if (totalLossValue > 0) {
    aiBusinessObservations.push(
      `Recorded inventory loss/damage of ${round2(totalLossValue)} during this period.`
    );
  }

  return {
    period: {
      type: period,
      startDate,
      endDate,
      periodDays,
    },
    businessOverview: {
      totalRevenue: round2(totalRevenue),
      totalCost: round2(totalCost),
      grossProfit: round2(grossProfit),
      totalExpenses: round2(totalExpenses),
      netProfit: round2(netProfit),
      profitMarginPct: round2(profitMarginPct),
      totalSalesCount,
      totalUnitsSold,
      totalInventoryValue: round2(totalInventoryValue),
      totalProducts: productPerformance.length,
    },
    aiBusinessObservations,
    bestPerformingProducts,
    slowMovingProducts,
    demandForecasts,
    restockingRecommendations: criticalRestocks,
    expiringInventory,
    inventoryLossSummary,
    discountOpportunities,
  };
};

export const AIService = {
  analyzeProductPerformance,
  generateDemandForecasts,
  getRestockingRecommendations,
  getDiscountRecommendations,
  getBusinessIntelligenceDashboard,
};
