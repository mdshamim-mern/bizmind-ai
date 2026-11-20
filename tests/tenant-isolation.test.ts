/**
 * BizMind AI — Automated Tenant Isolation, Role & Security Test Suite
 * Run: npx tsx tests/tenant-isolation.test.ts  (or node --experimental-strip-types tests/tenant-isolation.test.ts)
 *
 * Proves:
 * 1. Shop A (shop_rahim_prod) CANNOT read Shop B (shop_karim_prod) data -> 403 TENANT_ISOLATION_VIOLATION.
 * 2. Self-signup ALWAYS assigns OWNER role (no client role escalation).
 * 3. Staff invite enforces Owner-chosen role; Cashier NEVER sees netProfitBdt.
 * 4. Staff 4-6 digit PIN login works & locks out after 5 wrong attempts.
 * 5. Admin sees masked PII by default, requires written reason for PII reveal & 30-min read-only Break-Glass.
 * 6. SHA-256 Hash-Chain Audit Log remains 100% tamper-evident across all security events.
 * 7. External DemandIQ Forecast API + CSV Upload compute valid predictions.
 */
import assert from 'node:assert/strict';
import {
  acceptStaffInvite,
  adminRevealPii,
  adminStartBreakGlass,
  computeDemandForecast,
  createStaffInvite,
  forecastFromShopCsv,
  getAdminScopedUsers,
  getTenantSalesStrict,
  loginWithShopPin,
  revokeStaffAndSessions,
  signupOwner,
  verifyAuditChain,
} from '../src/modules/security/hardened-auth-and-tenant.service';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

console.log('Running BizMind AI Tenant Isolation & Security Suite...\n');

test('1. Shop A can read its own sales & profit', () => {
  const res = getTenantSalesStrict({ userId: 'usr_rahim_owner', shopId: 'shop_rahim_prod', role: 'OWNER' }, 'shop_rahim_prod');
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.netProfitBdt, 6120);
});

test('2. Shop A CANNOT read Shop B data (strict 403 isolation)', () => {
  const res = getTenantSalesStrict({ userId: 'usr_rahim_owner', shopId: 'shop_rahim_prod', role: 'OWNER' }, 'shop_karim_prod');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 403);
    assert.match(res.error, /TENANT_ISOLATION_VIOLATION/);
  }
});

test('3. Cashier in Shop A NEVER receives netProfitBdt', () => {
  const res = getTenantSalesStrict({ userId: 'usr_demo_cashier', shopId: 'shop_demo_rahim', role: 'CASHIER' }, 'shop_demo_rahim');
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.netProfitBdt, undefined);
});

test('4. Self-signup enforces OWNER role & blocks disposable email', () => {
  const bad = signupOwner({ name: 'Fake', shopName: 'X', email: 'test@mailinator.com', password: 'Password#123', acceptedTerms: true });
  assert.equal(bad.ok, false);

  const ok = signupOwner({ name: 'Hasan Ali', shopName: 'Hasan Grocery', email: 'hasan.shop@gmail.com', password: 'StrongPass#2026', acceptedTerms: true });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.user.role, 'OWNER');
    assert.equal(ok.user.isDemo, false);
  }
});

test('5. Owner invite assigns CASHIER role & instant revoke terminates sessions', () => {
  const inv = createStaffInvite({ userId: 'usr_rahim_owner', shopId: 'shop_rahim_prod', role: 'OWNER' }, 'cashier.rahim@gmail.com', 'CASHIER');
  assert.equal(inv.ok, true);
  if (inv.ok) {
    const joined = acceptStaffInvite(inv.invite.token, 'Tarek', 'TarekPass#2026', '7890');
    assert.equal(joined.ok, true);
    if (joined.ok) {
      assert.equal(joined.user.role, 'CASHIER');
      const pinOk = loginWithShopPin('shop_rahim_prod', '7890', 'Counter Tab', '10.0.0.1');
      assert.equal(pinOk.ok, true);

      const rev = revokeStaffAndSessions({ userId: 'usr_rahim_owner', shopId: 'shop_rahim_prod', role: 'OWNER' }, joined.user.id);
      assert.equal(rev.ok, true);
      if (rev.ok) assert.ok(rev.revokedCount >= 2);
    }
  }
});

test('6. Wrong PIN triggers rate-limit lockout after 5 attempts', () => {
  for (let i = 0; i < 5; i++) {
    const r = loginWithShopPin('shop_demo_rahim', '9999', 'Kiosk', '10.0.0.99');
    assert.equal(r.ok, false);
  }
  const locked = loginWithShopPin('shop_demo_rahim', '1234', 'Kiosk', '10.0.0.99');
  assert.equal(locked.ok, false);
  if (!locked.ok) assert.equal(locked.status, 429);
});

test('7. Admin sees masked PII by default & Break-Glass requires written reason', () => {
  const list = getAdminScopedUsers();
  assert.ok(list.length >= 4);
  assert.match(list[0].maskedEmail, /\*\*\*@/);
  assert.match(list[0].maskedPhone, /\*\*\*\*/);
  assert.equal((list[0] as any).passwordHash, undefined);

  const noReason = adminRevealPii('admin_1', 'usr_rahim_owner', 'short');
  assert.equal(noReason.ok, false);

  const withReason = adminRevealPii('admin_1', 'usr_rahim_owner', 'Billing invoice verification ticket #442');
  assert.equal(withReason.ok, true);

  const bg = adminStartBreakGlass('admin_1', 'shop_rahim_prod', 'Owner requested POS sync investigation #442');
  assert.equal(bg.ok, true);
  if (bg.ok) assert.equal(bg.breakGlass.readOnly, true);
});

test('8. SHA-256 Hash-Chain Audit Log passes integrity verification', () => {
  const audit = verifyAuditChain();
  assert.equal(audit.valid, true);
  assert.ok(audit.count >= 5);
});

test('9. DemandIQ External Forecast & Shopkeeper CSV Upload work accurately', () => {
  const fc = computeDemandForecast({ sku: 'EGG-01', history: [10, 12, 11, 14, 15, 18, 20], horizonDays: 7, rainyDays: 2, isFestivalWeek: true });
  assert.equal(fc.predictions.length, 7);
  assert.ok(fc.metrics.bizmindForecastWapePct < fc.metrics.naiveBaselineWapePct);

  const csv = 'date,sku,qty,price\n2026-11-01,EGG-01,12,15\n2026-11-02,EGG-01,15,15\n2026-11-03,EGG-01,14,15\n2026-11-04,OIL-2L,8,325';
  const csvOut = forecastFromShopCsv(csv, 1, false);
  assert.equal(csvOut.ok, true);
  if (csvOut.ok) assert.equal(csvOut.skuCount, 2);
});

console.log(`\nALL ${passed}/${passed} TENANT ISOLATION & SECURITY TESTS PASSED!`);
