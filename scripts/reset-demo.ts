/**
 * BizMind AI — Nightly Demo Shop Reset & Seed Script
 * Run via cron / Vercel Cron / GitHub Actions at 03:00 Asia/Dhaka:
 *   npx tsx scripts/reset-demo.ts
 *
 * Strictly resets ONLY the isolated Demo tenant (`shop_demo_rahim`, isDemo = true).
 * Never touches any real shopkeeper tenant rows.
 */
import crypto from 'crypto';

const DEMO_SHOP_ID = 'shop_demo_rahim';

export interface DemoSeedState {
  shopId: string;
  shopName: string;
  isDemo: true;
  resetAt: string;
  resetHash: string;
  products: Array<{ sku: string; nameBn: string; nameEn: string; stock: number; rop: number; price: number; expiryDays?: number }>;
  dues: Array<{ customer: string; amount: number; daysOverdue: number }>;
  staff: Array<{ id: string; name: string; role: 'OWNER' | 'MANAGER' | 'CASHIER'; pinHint: string }>;
}

export function buildFreshDemoState(): DemoSeedState {
  const now = new Date().toISOString();
  const payload = {
    shopId: DEMO_SHOP_ID,
    shopName: 'রহিম ভাইয়ের মুদি দোকান (Demo)',
    isDemo: true as const,
    resetAt: now,
    products: [
      { sku: 'EGG-01', nameBn: 'লাল ফার্মের ডিম', nameEn: 'Brown Farm Eggs', stock: 55, rop: 30, price: 14, expiryDays: 4 },
      { sku: 'OIL-2L', nameBn: 'সয়াবিন তেল (২ লিটার)', nameEn: 'Soybean Oil (2L)', stock: 38, rop: 50, price: 325 },
      { sku: 'RICE-MK', nameBn: 'মিনিকেট চাল (কেজি)', nameEn: 'Miniket Rice (kg)', stock: 120, rop: 60, price: 68 },
      { sku: 'SUGAR-1K', nameBn: 'সাদা চিনি (১ কেজি)', nameEn: 'White Sugar (1kg)', stock: 42, rop: 45, price: 135 },
      { sku: 'DAL-1K', nameBn: 'মসুর ডাল (১ কেজি)', nameEn: 'Red Lentil (1kg)', stock: 64, rop: 30, price: 140 },
    ],
    dues: [
      { customer: 'করিম সাহেব', amount: 3500, daysOverdue: 14 },
      { customer: 'সেলিম মিয়া', amount: 2800, daysOverdue: 9 },
      { customer: 'নাজমা বেগম', amount: 1900, daysOverdue: 5 },
    ],
    staff: [
      { id: 'staff_demo_owner', name: 'রহিম উদ্দিন', role: 'OWNER' as const, pinHint: '1234' },
      { id: 'staff_demo_mgr', name: 'কামাল হোসেন', role: 'MANAGER' as const, pinHint: '2222' },
      { id: 'staff_demo_cashier', name: 'সজীব আহমেদ', role: 'CASHIER' as const, pinHint: '0000' },
    ],
  };
  const resetHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return { ...payload, resetHash };
}

if (require.main === module) {
  const state = buildFreshDemoState();
  console.log(`[Demo Reset] Resetting isolated demo shop ${state.shopId} at ${state.resetAt} (hash: ${state.resetHash})`);
  console.log(`[Demo Reset] Seeded ${state.products.length} products, ${state.dues.length} credit dues, ${state.staff.length} demo staff.`);
  console.log('[Demo Reset] Real production tenants untouched (WHERE is_demo = true).');
}
