/**
 * BizMind AI — Mandatory Autonomous AI Safety Controls
 * 1. Spend Cap per Order (blocks AI POs exceeding owner limit)
 * 2. Dry-Run Mode (simulates execution without dispatching)
 * 3. Emergency Kill Switch (1-click halt for all autonomous agent actions)
 * 4. Indirect Prompt Injection Defense (sanitizes supplier emails & product names)
 * 5. Role-Locked AI Profit Isolation (Cashier cannot extract profit via AI)
 */

export interface SafetyConfig {
  killSwitchActive: boolean;
  dryRunMode: boolean;
  maxOrderSpendBdt: number;
}

export interface SafetyCheckResult {
  allowed: boolean;
  dryRun: boolean;
  reason: string;
}

const INDIRECT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /transfer\s+.*(tk|bdt|৳|\$|\d+)/i,
  /send\s+.*(password|token|secret|profit)/i,
  /override\s+(spend|limit|approval|kill\s*switch)/i,
  /system\s*prompt/i,
];

export function sanitizeExternalTextForAI(untrustedText: string): { cleanText: string; injectionDetected: boolean } {
  let injectionDetected = false;
  let cleanText = untrustedText;
  for (const rx of INDIRECT_INJECTION_PATTERNS) {
    if (rx.test(cleanText)) {
      injectionDetected = true;
      cleanText = cleanText.replace(rx, '[BLOCKED_UNTRUSTED_INSTRUCTION]');
    }
  }
  return { cleanText, injectionDetected };
}

export function evaluateAutonomousOrderSafety(
  config: SafetyConfig,
  orderTotalBdt: number,
  ownerApproved: boolean
): SafetyCheckResult {
  if (config.killSwitchActive) {
    return { allowed: false, dryRun: false, reason: 'Blocked: Emergency Kill Switch is ACTIVE.' };
  }
  if (!ownerApproved) {
    return { allowed: false, dryRun: false, reason: 'Blocked: Explicit Owner Approval is required.' };
  }
  if (orderTotalBdt > config.maxOrderSpendBdt) {
    return {
      allowed: false,
      dryRun: false,
      reason: `Blocked: Order total (৳${orderTotalBdt}) exceeds Owner Spend Cap (৳${config.maxOrderSpendBdt}).`,
    };
  }
  if (config.dryRunMode) {
    return {
      allowed: true,
      dryRun: true,
      reason: `Dry-Run Mode ON: Validated ৳${orderTotalBdt} PO safely without dispatching any external email.`,
    };
  }
  return { allowed: true, dryRun: false, reason: 'Approved & verified within Spend Cap.' };
}

export function canRoleAskFinancialAI(role: string, query: string): boolean {
  if (role === 'CASHIER' || role === 'STOCK_KEEPER') {
    if (/(profit|margin|net\s+income|লাভ|মুনাফা|ক্ষতি|আয়-ব্যয়)/i.test(query)) {
      return false;
    }
  }
  return true;
}
