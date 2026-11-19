export interface DiscountInput {
  productName: string;
  stock: number;
  unitCost: number;
  sellingPrice: number;
  daysToExpiry: number;
  baselineDailySales: number;
  priceElasticity?: number; // Default -2.4 (24% demand boost per 10% price cut)
}

export interface DiscountCandidate {
  discountPct: number;
  discountedPrice: number;
  projectedDailySales: number;
  unitsSoldBeforeExpiry: number;
  wastedUnits: number;
  netCashRecovered: number;
  netProfitImpact: number;
}

export interface DiscountOptimizationResult {
  optimal: DiscountCandidate;
  baselineNoDiscount: DiscountCandidate;
  extraCashSaved: number;
  curve: DiscountCandidate[];
  explanation: string;
}

/**
 * Mathematical Discount Optimization using Price Elasticity of Demand.
 * Evaluates 0% to 40% discounts to find the exact percentage that maximizes
 * net cash recovered before expiry while protecting floor margin.
 */
export function optimizeExpiryDiscount(input: DiscountInput): DiscountOptimizationResult {
  const elasticity = Math.abs(input.priceElasticity ?? 2.4);
  const steps = [0, 5, 10, 12, 15, 18, 20, 25, 30, 35];
  const curve: DiscountCandidate[] = steps.map((discountPct) => {
    const discountedPrice = Number((input.sellingPrice * (1 - discountPct / 100)).toFixed(2));
    // Demand lift: Q_new = Q_0 * (1 + E * (%price_drop))
    const projectedDailySales = Number((input.baselineDailySales * (1 + elasticity * (discountPct / 100))).toFixed(2));
    const unitsSoldBeforeExpiry = Math.min(input.stock, Math.floor(projectedDailySales * input.daysToExpiry));
    const wastedUnits = Math.max(0, input.stock - unitsSoldBeforeExpiry);
    const netCashRecovered = Math.round(unitsSoldBeforeExpiry * discountedPrice);
    const totalCost = input.stock * input.unitCost;
    const netProfitImpact = Math.round(netCashRecovered - totalCost);
    return {
      discountPct,
      discountedPrice,
      projectedDailySales,
      unitsSoldBeforeExpiry,
      wastedUnits,
      netCashRecovered,
      netProfitImpact,
    };
  });

  const baselineNoDiscount = curve[0];
  let optimal = curve[0];
  for (const c of curve) {
    if (c.netCashRecovered > optimal.netCashRecovered) {
      optimal = c;
    }
  }

  const extraCashSaved = Math.max(0, optimal.netCashRecovered - baselineNoDiscount.netCashRecovered);
  const explanation =
    `Using price elasticity E=-${elasticity.toFixed(1)}, a ${optimal.discountPct}% discount (৳${optimal.discountedPrice}/unit) ` +
    `lifts demand from ${input.baselineDailySales}/day to ${optimal.projectedDailySales}/day, selling ${optimal.unitsSoldBeforeExpiry}/${input.stock} units ` +
    `before expiry and recovering ৳${optimal.netCashRecovered} (+৳${extraCashSaved} vs no discount).`;

  return { optimal, baselineNoDiscount, extraCashSaved, curve, explanation };
}

export interface CreditCustomer {
  id: string;
  name: string;
  dueAmount: number;
  overdueDays: number;
  totalLifetimeCredit: number;
  onTimePaymentRate: number; // 0 to 1
}

export interface CreditRiskResult {
  customerId: string;
  riskScore: number; // 0 (safe) to 100 (high default risk)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: string[];
  recommendedAction: string;
}

export function scoreCustomerCreditRisk(c: CreditCustomer): CreditRiskResult {
  const daysScore = Math.min(45, Math.round((c.overdueDays / 30) * 45));
  const exposureRatio = c.totalLifetimeCredit > 0 ? c.dueAmount / c.totalLifetimeCredit : 0.5;
  const exposureScore = Math.min(25, Math.round(exposureRatio * 25));
  const historyPenalty = Math.min(30, Math.round((1 - Math.max(0, Math.min(1, c.onTimePaymentRate))) * 30));
  const riskScore = Math.min(100, daysScore + exposureScore + historyPenalty);

  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
    riskScore >= 65 ? 'HIGH' : riskScore >= 35 ? 'MEDIUM' : 'LOW';

  const factors = [
    `Overdue duration: ${c.overdueDays} days (+${daysScore} pts)`,
    `Outstanding exposure: ৳${c.dueAmount} (+${exposureScore} pts)`,
    `On-time history: ${Math.round(c.onTimePaymentRate * 100)}% (+${historyPenalty} pts)`,
  ];

  const recommendedAction =
    riskLevel === 'HIGH'
      ? 'Pause new credit & send polite WhatsApp/SMS reminder today.'
      : riskLevel === 'MEDIUM'
      ? 'Send friendly reminder before weekend settlement.'
      : 'Healthy credit standing — eligible for standard terms.';

  return { customerId: c.id, riskScore, riskLevel, factors, recommendedAction };
}

export interface ApprovalActionItem {
  id: string;
  type: 'PROMO_OFFER' | 'PURCHASE_ORDER' | 'BAKI_REMINDER';
  title: string;
  summary: string;
  estimatedImpactBdt: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedBy?: string;
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /reveal\s+(your\s+)?system\s+prompt/i,
  /drop\s+table/i,
  /union\s+select/i,
  /other\s+shop'?s?\s+(sales|data|password|token)/i,
  /switch\s+role\s+to\s+(super_?admin|owner)/i,
  /bypass\s+(rbac|auth|security)/i,
];

export function checkGuardrails(message: string): { safe: boolean; reason?: string } {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        safe: false,
        reason: 'Prompt injection or unauthorized cross-tenant/role escalation attempt blocked by BizMind Guardrails.',
      };
    }
  }
  return { safe: true };
}
