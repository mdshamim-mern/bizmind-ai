import assert from 'assert';
import {
  checkIdempotency,
  consumeShopQuota,
  generateBanglaSmsOtp,
  getCachedAIResponse,
  getShopAuditLogs,
  hasPermission,
  recordAuditLog,
  routeAIModelByComplexity,
  saveIdempotency,
  setCachedAIResponse,
  verifyBanglaSmsOtp,
} from '../src/modules/enterprise/enterprise.service';

// ============================================================================
// BizMind AI - Multi-Tenant Isolation, Idempotency, RBAC, OTP & Quota Tests
// Run: npx ts-node tests/isolation-and-enterprise.test.ts
// ============================================================================

function runEnterpriseTests() {
  // 1. Two-Shop Isolation Test (Shop A cannot read Shop B's Audit Logs or Cache)
  recordAuditLog({
    shopId: 'shop_rahim_01',
    actorRole: 'OWNER',
    action: 'SALE_CREATED',
    entityType: 'Sale',
    detail: 'Sold 60 brown eggs for ৳900',
  });
  recordAuditLog({
    shopId: 'shop_greencare_02',
    actorRole: 'CASHIER',
    action: 'SALE_CREATED',
    entityType: 'Sale',
    detail: 'Sold 10 Napa boxes for ৳1200',
  });

  const shopALogs = getShopAuditLogs('shop_rahim_01');
  const shopBLogs = getShopAuditLogs('shop_greencare_02');
  assert(shopALogs.items.every((l) => l.shopId === 'shop_rahim_01'), 'Shop A leaked Shop B logs!');
  assert(shopBLogs.items.every((l) => l.shopId === 'shop_greencare_02'), 'Shop B leaked Shop A logs!');

  // 2. Idempotency Key Test (Prevents duplicate sale on unstable mobile internet)
  saveIdempotency('shop_rahim_01', 'sale_idem_991', { invoiceId: 'INV-991', total: 900 });
  const replay = checkIdempotency('shop_rahim_01', 'sale_idem_991');
  assert(replay && replay.invoiceId === 'INV-991', 'Idempotency must return original invoice');
  assert(checkIdempotency('shop_greencare_02', 'sale_idem_991') === null, 'Idempotency key must be tenant-isolated');

  // 3. RBAC Permission Matrix (Owner, Manager, Cashier)
  assert(hasPermission('OWNER', 'shop:delete') === true, 'Owner has full access');
  assert(hasPermission('MANAGER', 'ai:use') === true, 'Manager can use AI');
  assert(hasPermission('CASHIER', 'reports:read') === false, 'Cashier must not view owner financial reports');

  // 4. Bangladesh SMS OTP Login Test
  const otp = generateBanglaSmsOtp('+8801711223344');
  assert(verifyBanglaSmsOtp('+8801711223344', otp.demoOtp) === true, 'Valid SMS OTP must verify');
  assert(verifyBanglaSmsOtp('+8801711223344', otp.demoOtp) === false, 'OTP must be single-use');

  // 5. AI Cost Control: Model Routing + Response Cache + Monthly Quota
  const simpleRoute = routeAIModelByComplexity('হ্যালো');
  const complexRoute = routeAIModelByComplexity('আজকে বগুড়াতে আলুর দাম কত?');
  assert(simpleRoute.tierLabel === 'FAST_CHEAP', 'Simple greeting should route to cheap fast model');
  assert(complexRoute.useGoogleSearch === true, 'Live market price query must enable Google Search');

  setCachedAIResponse('shop_rahim_01', 'bn', 'আজকের লাভ কত?', 'নিট লাভ ৳৪,৫৫০', 'GEMINI');
  const cached = getCachedAIResponse('shop_rahim_01', 'bn', 'আজকের লাভ কত?');
  assert(cached !== null && cached.provider.includes('CACHED'), 'Repeated question must hit cache');

  const qCheck = consumeShopQuota('shop_rahim_01', 250);
  assert(qCheck.allowed === true && qCheck.quota.usedThisMonth === 1, 'Shop quota must increment cleanly');

  console.log('Enterprise Isolation, Idempotency, RBAC, OTP & AI Cost-Control Suite: 5/5 PASSED.');
}

runEnterpriseTests();
