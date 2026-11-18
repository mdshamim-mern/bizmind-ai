import { AdjustmentType } from '@prisma/client';
import prisma from '../../shared/prisma';

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
}

export interface RecordSalePayload {
  items: SaleItemInput[];
  discount?: number;
  paymentMethod?: string;
  invoiceNo?: string;
  soldAt?: string | Date;
}

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string | Date;
}

export interface RecordPurchasePayload {
  supplierId?: string;
  userId?: string;
  status?: 'RECEIVED' | 'PENDING' | 'COMPLETED';
  purchasedAt?: string | Date;
  items: PurchaseItemInput[];
}

export interface RecordExpensePayload {
  title: string;
  category: string;
  amount: number;
  incurredAt?: string | Date;
}

export type StatementPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sortFefoBatches = <T extends { expiryDate: Date | null; receivedAt: Date }>(batches: T[]): T[] => {
  return [...batches].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) {
      const diff = a.expiryDate.getTime() - b.expiryDate.getTime();
      if (diff !== 0) return diff;
    } else if (a.expiryDate && !b.expiryDate) {
      return -1;
    } else if (!a.expiryDate && b.expiryDate) {
      return 1;
    }
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
};

export const recordSale = async (
  shopId: string,
  userId: string,
  payload: RecordSalePayload
) => {
  if (!payload.items || payload.items.length === 0) {
    throw new HttpError(400, 'At least one sale item is required.');
  }

  const discount = Number(payload.discount || 0);
  if (discount < 0) {
    throw new HttpError(400, 'Discount cannot be negative.');
  }

  return prisma.$transaction(async (tx) => {
    let subtotalRevenue = 0;
    let totalCogs = 0;

    const saleItemsData: Array<{
      shopId: string;
      productId: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    const itemBreakdowns: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      cogs: number;
      currentStock: number;
      batchesUsed: Array<{ batchId: string; batchNumber: string | null; quantity: number; costPrice: number }>;
    }> = [];

    for (const item of payload.items) {
      if (!item.productId || item.quantity <= 0) {
        throw new HttpError(400, 'Each sale item must have a valid productId and positive quantity.');
      }

      const product = await tx.product.findFirst({
        where: { id: item.productId, shopId },
        include: {
          batches: {
            where: { quantity: { gt: 0 } },
          },
        },
      });

      if (!product) {
        throw new HttpError(404, `Product ${item.productId} not found for this shop.`);
      }

      const fefoBatches = sortFefoBatches(product.batches);
      const totalAvailable = fefoBatches.reduce((sum, b) => sum + b.quantity, 0);

      if (totalAvailable < item.quantity) {
        throw new HttpError(
          400,
          `Insufficient stock for product "${product.name}". Available: ${totalAvailable}, Requested: ${item.quantity}`
        );
      }

      let remainingToDeduct = item.quantity;
      let itemCogs = 0;
      const batchesUsed: Array<{ batchId: string; batchNumber: string | null; quantity: number; costPrice: number }> = [];

      for (const batch of fefoBatches) {
        if (remainingToDeduct <= 0) break;

        const deductQty = Math.min(batch.quantity, remainingToDeduct);
        const batchCost = Number(batch.costPrice);

        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantity: batch.quantity - deductQty },
        });

        itemCogs += deductQty * batchCost;
        remainingToDeduct -= deductQty;
        batchesUsed.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: deductQty,
          costPrice: batchCost,
        });
      }

      const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(product.sellingPrice);
      const lineRevenue = unitPrice * item.quantity;

      subtotalRevenue += lineRevenue;
      totalCogs += itemCogs;

      saleItemsData.push({
        shopId,
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
      });

      itemBreakdowns.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        cogs: Number(itemCogs.toFixed(2)),
        currentStock: totalAvailable - item.quantity,
        batchesUsed,
      });
    }

    const totalAmount = Math.max(0, subtotalRevenue - discount);
    const grossProfit = totalAmount - totalCogs;
    const invoiceNo =
      payload.invoiceNo || `INV-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const sale = await tx.sale.create({
      data: {
        shopId,
        userId,
        invoiceNo,
        totalAmount,
        discount,
        paymentMethod: payload.paymentMethod || 'CASH',
        soldAt: payload.soldAt ? new Date(payload.soldAt) : new Date(),
        items: {
          create: saleItemsData,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return {
      sale,
      totalRevenue: Number(totalAmount.toFixed(2)),
      totalCogs: Number(totalCogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      itemBreakdowns,
    };
  });
};

export const getSales = async (shopId: string, startDate?: Date, endDate?: Date) => {
  const where: Record<string, unknown> = { shopId };
  if (startDate || endDate) {
    where.soldAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  return prisma.sale.findMany({
    where,
    include: {
      items: {
        include: {
          product: {
            include: { category: true },
          },
        },
      },
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { soldAt: 'desc' },
  });
};

export const recordPurchase = async (shopId: string, payload: RecordPurchasePayload) => {
  if (!payload.items || payload.items.length === 0) {
    throw new HttpError(400, 'At least one purchase item is required.');
  }

  const status = payload.status || 'RECEIVED';

  return prisma.$transaction(async (tx) => {
    if (payload.supplierId) {
      const supplier = await tx.supplier.findFirst({
        where: { id: payload.supplierId, shopId },
      });
      if (!supplier) {
        throw new HttpError(404, 'Supplier not found for this shop.');
      }
    }

    let totalAmount = 0;
    const purchaseItemsData: Array<{
      shopId: string;
      productId: string;
      quantity: number;
      unitCost: number;
    }> = [];

    for (const item of payload.items) {
      if (!item.productId || item.quantity <= 0 || item.unitCost < 0) {
        throw new HttpError(400, 'Each purchase item requires valid productId, positive quantity, and non-negative unitCost.');
      }

      const product = await tx.product.findFirst({
        where: { id: item.productId, shopId },
      });
      if (!product) {
        throw new HttpError(404, `Product ${item.productId} not found for this shop.`);
      }

      totalAmount += item.quantity * item.unitCost;
      purchaseItemsData.push({
        shopId,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
      });
    }

    const purchase = await tx.purchase.create({
      data: {
        shopId,
        supplierId: payload.supplierId || null,
        userId: payload.userId || null,
        totalAmount,
        status,
        purchasedAt: payload.purchasedAt ? new Date(payload.purchasedAt) : new Date(),
        items: {
          create: purchaseItemsData,
        },
      },
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (status === 'RECEIVED' || status === 'COMPLETED') {
      for (const item of payload.items) {
        await tx.inventoryBatch.create({
          data: {
            shopId,
            productId: item.productId,
            batchNumber: item.batchNumber || `BATCH-${Date.now()}`,
            quantity: item.quantity,
            costPrice: item.unitCost,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          },
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { costPrice: item.unitCost },
        });
      }
    }

    return purchase;
  });
};

export const receivePendingPurchase = async (shopId: string, purchaseId: string) => {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, shopId },
      include: { items: true },
    });

    if (!purchase) {
      throw new HttpError(404, 'Purchase order not found.');
    }

    if (purchase.status !== 'PENDING') {
      throw new HttpError(400, `Purchase order cannot be received because its status is ${purchase.status}.`);
    }

    const updatedPurchase = await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: 'RECEIVED' },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    });

    for (const item of purchase.items) {
      await tx.inventoryBatch.create({
        data: {
          shopId,
          productId: item.productId,
          batchNumber: `PO-${purchase.id.slice(0, 8)}-${Date.now()}`,
          quantity: item.quantity,
          costPrice: item.unitCost,
          expiryDate: null,
        },
      });

      await tx.product.update({
        where: { id: item.productId },
        data: { costPrice: item.unitCost },
      });
    }

    return updatedPurchase;
  });
};

export const getPurchases = async (shopId: string, status?: string) => {
  return prisma.purchase.findMany({
    where: {
      shopId,
      ...(status ? { status } : {}),
    },
    include: {
      supplier: true,
      items: {
        include: { product: true },
      },
    },
    orderBy: { purchasedAt: 'desc' },
  });
};

export const recordExpense = async (
  shopId: string,
  _userId: string,
  payload: RecordExpensePayload
) => {
  if (!payload.title || !payload.category || payload.amount === undefined || payload.amount <= 0) {
    throw new HttpError(400, 'Expense title, category, and positive amount are required.');
  }

  return prisma.expense.create({
    data: {
      shopId,
      title: payload.title,
      category: payload.category,
      amount: payload.amount,
      incurredAt: payload.incurredAt ? new Date(payload.incurredAt) : new Date(),
    },
  });
};

export const getExpenses = async (shopId: string, startDate?: Date, endDate?: Date) => {
  const where: Record<string, unknown> = { shopId };
  if (startDate || endDate) {
    where.incurredAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  return prisma.expense.findMany({
    where,
    orderBy: { incurredAt: 'desc' },
  });
};

const resolveDateRange = (
  period: StatementPeriod,
  customStart?: Date,
  customEnd?: Date
): { startDate: Date; endDate: Date } => {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  switch (period) {
    case 'daily': {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'weekly': {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'monthly': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    }
    case 'custom': {
      if (!customStart || !customEnd) {
        throw new HttpError(400, 'Custom period requires both startDate and endDate.');
      }
      startDate = customStart;
      endDate = customEnd;
      break;
    }
    default:
      throw new HttpError(400, 'Invalid period. Must be daily, weekly, monthly, or custom.');
  }

  return { startDate, endDate };
};

export const getFinancialStatement = async (
  shopId: string,
  period: StatementPeriod,
  customStart?: Date,
  customEnd?: Date
) => {
  const { startDate, endDate } = resolveDateRange(period, customStart, customEnd);

  const [sales, expenses, lossAdjustments] = await Promise.all([
    prisma.sale.findMany({
      where: {
        shopId,
        soldAt: { gte: startDate, lte: endDate },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        shopId,
        incurredAt: { gte: startDate, lte: endDate },
      },
    }),
    prisma.stockAdjustment.findMany({
      where: {
        shopId,
        type: { in: [AdjustmentType.DAMAGE, AdjustmentType.LOSS] },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        product: true,
      },
    }),
  ]);

  let totalRevenue = 0;
  let costOfGoodsSold = 0;

  for (const sale of sales) {
    totalRevenue += Number(sale.totalAmount);
    for (const item of sale.items) {
      costOfGoodsSold += item.quantity * Number(item.product.costPrice);
    }
  }

  const grossProfit = totalRevenue - costOfGoodsSold;
  const operatingExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // Inventory losses (DAMAGE / LOSS) are deducted once here and never double-counted in COGS
  const inventoryLosses = lossAdjustments.reduce(
    (sum, adj) => sum + Math.abs(adj.quantity) * Number(adj.product.costPrice),
    0
  );

  const netProfit = grossProfit - operatingExpenses - inventoryLosses;

  return {
    period,
    startDate,
    endDate,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    costOfGoodsSold: Number(costOfGoodsSold.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    operatingExpenses: Number(operatingExpenses.toFixed(2)),
    inventoryLosses: Number(inventoryLosses.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    margins: {
      grossMarginPercent: totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0,
      netMarginPercent: totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(2)) : 0,
    },
  };
};

export const getProfitByProductAndCategory = async (
  shopId: string,
  startDate?: Date,
  endDate?: Date
) => {
  const saleFilter: Record<string, unknown> = { shopId };
  if (startDate || endDate) {
    saleFilter.soldAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  const saleItems = await prisma.saleItem.findMany({
    where: {
      shopId,
      sale: saleFilter,
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
    },
  });

  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      sku: string;
      categoryId: string | null;
      categoryName: string;
      unitsSold: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      marginPercent: number;
    }
  >();

  const categoryMap = new Map<
    string,
    {
      categoryId: string | null;
      categoryName: string;
      unitsSold: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      marginPercent: number;
    }
  >();

  for (const item of saleItems) {
    const revenue = item.quantity * Number(item.unitPrice);
    const cogs = item.quantity * Number(item.product.costPrice);
    const profit = revenue - cogs;

    const existingProduct = productMap.get(item.productId) || {
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      categoryId: item.product.categoryId,
      categoryName: item.product.category?.name || 'Uncategorized',
      unitsSold: 0,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      marginPercent: 0,
    };

    existingProduct.unitsSold += item.quantity;
    existingProduct.revenue += revenue;
    existingProduct.cogs += cogs;
    existingProduct.grossProfit += profit;
    productMap.set(item.productId, existingProduct);

    const catKey = item.product.categoryId || 'uncategorized';
    const existingCategory = categoryMap.get(catKey) || {
      categoryId: item.product.categoryId,
      categoryName: item.product.category?.name || 'Uncategorized',
      unitsSold: 0,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      marginPercent: 0,
    };

    existingCategory.unitsSold += item.quantity;
    existingCategory.revenue += revenue;
    existingCategory.cogs += cogs;
    existingCategory.grossProfit += profit;
    categoryMap.set(catKey, existingCategory);
  }

  const byProduct = Array.from(productMap.values())
    .map((p) => ({
      ...p,
      revenue: Number(p.revenue.toFixed(2)),
      cogs: Number(p.cogs.toFixed(2)),
      grossProfit: Number(p.grossProfit.toFixed(2)),
      marginPercent: p.revenue > 0 ? Number(((p.grossProfit / p.revenue) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const byCategory = Array.from(categoryMap.values())
    .map((c) => ({
      ...c,
      revenue: Number(c.revenue.toFixed(2)),
      cogs: Number(c.cogs.toFixed(2)),
      grossProfit: Number(c.grossProfit.toFixed(2)),
      marginPercent: c.revenue > 0 ? Number(((c.grossProfit / c.revenue) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    byProduct,
    byCategory,
  };
};
