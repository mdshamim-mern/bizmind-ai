import { PrismaClient, UserRole, AdjustmentType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const daysAgo = (days: number): Date => {
const d = new Date();
d.setDate(d.getDate() - days);
return d;
};

const daysFromNow = (days: number): Date => {
const d = new Date();
d.setDate(d.getDate() + days);
return d;
};

async function main() {
console.log('Seeding BizMind AI 30-day grocery demo data...');

const shop = await prisma.shop.upsert({
where: { slug: 'bismillah-super-grocery' },
update: { name: 'Bismillah Super Grocery', currency: 'BDT', timezone: 'Asia/Dhaka' },
create: { name: 'Bismillah Super Grocery', slug: 'bismillah-super-grocery', currency: 'BDT', timezone: 'Asia/Dhaka' },
});

const passwordHash = await bcrypt.hash('demo1234', 10);
const owner = await prisma.user.upsert({
where: { email: 'demo@bizmind.ai' },
update: { name: 'Bismillah Store Owner', passwordHash, role: UserRole.OWNER, shopId: shop.id, isActive: true },
create: { shopId: shop.id, name: 'Bismillah Store Owner', email: 'demo@bizmind.ai', passwordHash, role: UserRole.OWNER, isActive: true },
});

await prisma.saleItem.deleteMany({ where: { shopId: shop.id } });
await prisma.sale.deleteMany({ where: { shopId: shop.id } });
await prisma.purchaseItem.deleteMany({ where: { shopId: shop.id } });
await prisma.purchase.deleteMany({ where: { shopId: shop.id } });
await prisma.stockAdjustment.deleteMany({ where: { shopId: shop.id } });
await prisma.inventoryBatch.deleteMany({ where: { shopId: shop.id } });
await prisma.expense.deleteMany({ where: { shopId: shop.id } });
await prisma.product.deleteMany({ where: { shopId: shop.id } });
await prisma.supplier.deleteMany({ where: { shopId: shop.id } });
await prisma.category.deleteMany({ where: { shopId: shop.id } });

const catNames = ['Dairy & Eggs', 'Grocery & Staples', 'Imported & Premium'];
const categories: Record<string, string> = {};
for (const name of catNames) {
const c = await prisma.category.create({ data: { shopId: shop.id, name } });
categories[name] = c.id;
}

const supplierMeta = [
{ name: 'Dhaka Fresh Agro Ltd', phone: '+8801711000001', email: 'orders@dhakafresh.bd', address: 'Savar, Dhaka (leadTimeDays: 2)', leadTimeDays: 2 },
{ name: 'Padma Grains & Oil', phone: '+8801711000002', email: 'supply@padmagrains.bd', address: 'Bogura & Narayanganj (leadTimeDays: 4)', leadTimeDays: 4 },
{ name: 'Global Gourmet Imports', phone: '+8801711000003', email: 'import@globalgourmet.bd', address: 'Chattogram Port Zone (leadTimeDays: 7)', leadTimeDays: 7 },
];
const suppliers = [];
for (const s of supplierMeta) {
const created = await prisma.supplier.create({
data: { shopId: shop.id, name: s.name, phone: s.phone, email: s.email, address: s.address },
});
suppliers.push({ ...created, leadTimeDays: s.leadTimeDays });
}

const productSpecs = [
{ sku: 'EGG-001', name: 'Farm Eggs', category: 'Dairy & Eggs', unit: 'pcs', costPrice: 10, sellingPrice: 15, reorderLevel: 120 },
{ sku: 'OIL-A01', name: 'Product A - Imported Olive Oil', category: 'Imported & Premium', unit: 'bottle', costPrice: 850, sellingPrice: 1250, reorderLevel: 12 },
{ sku: 'RICE-B01', name: 'Product B - Miniket Rice', category: 'Grocery & Staples', unit: 'kg', costPrice: 62, sellingPrice: 78, reorderLevel: 80 },
{ sku: 'OIL-C01', name: 'Product C - Fortified Soybean Oil', category: 'Grocery & Staples', unit: 'liter', costPrice: 155, sellingPrice: 185, reorderLevel: 40 },
{ sku: 'MILK-001', name: 'Liquid Milk', category: 'Dairy & Eggs', unit: 'liter', costPrice: 75, sellingPrice: 95, reorderLevel: 30 },
{ sku: 'HONEY-001', name: 'Organic Honey', category: 'Imported & Premium', unit: 'jar', costPrice: 420, sellingPrice: 600, reorderLevel: 15 },
];

const products: Record<string, any> = {};
for (const p of productSpecs) {
const created = await prisma.product.create({
data: {
shopId: shop.id,
categoryId: categories[p.category],
sku: p.sku,
name: p.name,
unit: p.unit,
costPrice: p.costPrice,
sellingPrice: p.sellingPrice,
reorderLevel: p.reorderLevel,
},
});
products[p.sku] = created;
}

const batchSpecs = [
{ sku: 'EGG-001', batchNumber: 'EGG-B01-FEFO', quantity: 55, costPrice: 10, expiryDays: 4, receivedDaysAgo: 12 },
{ sku: 'EGG-001', batchNumber: 'EGG-B02-FRESH', quantity: 180, costPrice: 10, expiryDays: 14, receivedDaysAgo: 2 },
{ sku: 'OIL-A01', batchNumber: 'OLV-B01', quantity: 14, costPrice: 850, expiryDays: 180, receivedDaysAgo: 28 },
{ sku: 'OIL-A01', batchNumber: 'OLV-B02', quantity: 16, costPrice: 860, expiryDays: 320, receivedDaysAgo: 5 },
{ sku: 'RICE-B01', batchNumber: 'RICE-B01', quantity: 120, costPrice: 62, expiryDays: 240, receivedDaysAgo: 25 },
{ sku: 'RICE-B01', batchNumber: 'RICE-B02', quantity: 150, costPrice: 63, expiryDays: 300, receivedDaysAgo: 6 },
{ sku: 'OIL-C01', batchNumber: 'SOY-B01', quantity: 35, costPrice: 155, expiryDays: 90, receivedDaysAgo: 22 },
{ sku: 'OIL-C01', batchNumber: 'SOY-B02', quantity: 60, costPrice: 158, expiryDays: 210, receivedDaysAgo: 4 },
{ sku: 'MILK-001', batchNumber: 'MILK-B01-EXP', quantity: 18, costPrice: 75, expiryDays: 3, receivedDaysAgo: 5 },
{ sku: 'MILK-001', batchNumber: 'MILK-B02', quantity: 40, costPrice: 75, expiryDays: 10, receivedDaysAgo: 1 },
{ sku: 'HONEY-001', batchNumber: 'HNY-B01', quantity: 22, costPrice: 420, expiryDays: 365, receivedDaysAgo: 20 },
];

for (const b of batchSpecs) {
await prisma.inventoryBatch.create({
data: {
shopId: shop.id,
productId: products[b.sku].id,
batchNumber: b.batchNumber,
quantity: b.quantity,
costPrice: b.costPrice,
expiryDate: daysFromNow(b.expiryDays),
receivedAt: daysAgo(b.receivedDaysAgo),
},
});
}

const purchase = await prisma.purchase.create({
data: {
shopId: shop.id,
supplierId: suppliers[0].id,
userId: owner.id,
totalAmount: 19450,
status: 'COMPLETED',
purchasedAt: daysAgo(15),
items: {
create: [
{ shopId: shop.id, productId: products['EGG-001'].id, quantity: 300, unitCost: 10 },
{ shopId: shop.id, productId: products['MILK-001'].id, quantity: 100, unitCost: 75 },
{ shopId: shop.id, productId: products['RICE-B01'].id, quantity: 145, unitCost: 62 },
],
},
},
});
console.log('Created purchase:', purchase.id);

// 4-week sales trend: Week 1 (50) -> Week 2 (65) -> Week 3 (80) -> Week 4 (100)
// Includes exact 60 Farm Eggs sold: Revenue 900 BDT, COGS 600 BDT, Gross Profit 300 BDT
const weeklyTrend = [
{ week: 1, totalUnits: 50, startDayAgo: 28, eggQty: 10, riceQty: 25, soyQty: 10, milkQty: 5 },
{ week: 2, totalUnits: 65, startDayAgo: 21, eggQty: 12, riceQty: 30, soyQty: 13, milkQty: 10 },
{ week: 3, totalUnits: 80, startDayAgo: 14, eggQty: 18, riceQty: 35, soyQty: 15, milkQty: 12 },
{ week: 4, totalUnits: 100, startDayAgo: 7, eggQty: 20, riceQty: 45, soyQty: 20, milkQty: 15 },
];

let invCounter = 1001;
for (const w of weeklyTrend) {
const totalAmount = w.eggQty * 15 + w.riceQty * 78 + w.soyQty * 185 + w.milkQty * 95;
await prisma.sale.create({
data: {
shopId: shop.id,
userId: owner.id,
invoiceNo: `INV-${invCounter++}`,
totalAmount,
discount: 0,
paymentMethod: 'CASH',
soldAt: daysAgo(w.startDayAgo),
items: {
create: [
{ shopId: shop.id, productId: products['EGG-001'].id, quantity: w.eggQty, unitPrice: 15 },
{ shopId: shop.id, productId: products['RICE-B01'].id, quantity: w.riceQty, unitPrice: 78 },
{ shopId: shop.id, productId: products['OIL-C01'].id, quantity: w.soyQty, unitPrice: 185 },
{ shopId: shop.id, productId: products['MILK-001'].id, quantity: w.milkQty, unitPrice: 95 },
],
},
},
});
}

// Operating expenses: RENT, UTILITIES, SALARY
const expenses = [
{ title: 'Monthly Store Rent', category: 'RENT', amount: 25000, daysAgo: 25 },
{ title: 'Electricity & Cold Storage Utilities', category: 'UTILITIES', amount: 4800, daysAgo: 10 },
{ title: 'Store Staff Salary (2 Cashiers)', category: 'SALARY', amount: 22000, daysAgo: 3 },
];
for (const e of expenses) {
await prisma.expense.create({
data: { shopId: shop.id, title: e.title, category: e.category, amount: e.amount, incurredAt: daysAgo(e.daysAgo) },
});
}

// 5 broken eggs stock discrepancy: DAMAGE loss 50 BDT (5 * 10 BDT cost)
await prisma.stockAdjustment.create({
data: {
shopId: shop.id,
productId: products['EGG-001'].id,
type: AdjustmentType.DAMAGE,
quantity: -5,
reason: '5 broken Farm Eggs during crate handling (DAMAGE loss: 50 BDT)',
createdAt: daysAgo(2),
},
});

console.log('Seeded Bismillah Super Grocery (demo@bizmind.ai) successfully!');
}

main()
.catch((e) => {
console.error(e);
process.exit(1);
})
.finally(async () => {
await prisma.$disconnect();
});
