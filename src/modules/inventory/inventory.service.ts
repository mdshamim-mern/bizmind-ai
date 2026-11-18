import { AdjustmentType } from '@prisma/client';
import prisma from '../../shared/prisma';

export const createCategory = async (shopId: string, name: string) => {
  return prisma.category.create({
    data: { shopId, name },
  });
};

export const getCategories = async (shopId: string) => {
  return prisma.category.findMany({
    where: { shopId },
    orderBy: { name: 'asc' },
  });
};

export interface CreateSupplierInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export const createSupplier = async (shopId: string, input: CreateSupplierInput) => {
  return prisma.supplier.create({
    data: {
      shopId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
    },
  });
};

export const getSuppliers = async (shopId: string) => {
  return prisma.supplier.findMany({
    where: { shopId },
    orderBy: { name: 'asc' },
  });
};

export interface CreateProductInput {
  categoryId?: string;
  sku: string;
  name: string;
  unit?: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel?: number;
}

export const createProduct = async (shopId: string, input: CreateProductInput) => {
  return prisma.product.create({
    data: {
      shopId,
      categoryId: input.categoryId,
      sku: input.sku,
      name: input.name,
      unit: input.unit || 'pcs',
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      reorderLevel: input.reorderLevel ?? 10,
    },
    include: { category: true },
  });
};

export const getProducts = async (shopId: string) => {
  const products = await prisma.product.findMany({
    where: { shopId },
    include: {
      category: true,
      batches: {
        where: { quantity: { gt: 0 } },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  });

  return products.map((product) => ({
    ...product,
    totalStock: product.batches.reduce((sum, b) => sum + b.quantity, 0),
  }));
};

export interface AddBatchInput {
  productId: string;
  batchNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate?: string | Date | null;
  receivedAt?: string | Date;
}

export const addBatch = async (shopId: string, input: AddBatchInput) => {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, shopId },
  });

  if (!product) {
    const error = new Error('Product not found in this shop') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  return prisma.inventoryBatch.create({
    data: {
      shopId,
      productId: input.productId,
      batchNumber: input.batchNumber,
      quantity: input.quantity,
      costPrice: input.costPrice,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
    },
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true } },
    },
  });
};

export const getExpiringBatches = async (shopId: string, daysAhead = 30) => {
  const now = new Date();
  const targetDate = new Date();
  targetDate.setDate(now.getDate() + daysAhead);

  return prisma.inventoryBatch.findMany({
    where: {
      shopId,
      quantity: { gt: 0 },
      expiryDate: {
        not: null,
        lte: targetDate,
      },
    },
    include: {
      product: {
        select: { id: true, name: true, sku: true, unit: true },
      },
    },
    orderBy: { expiryDate: 'asc' },
  });
};

export interface RecordStockAdjustmentInput {
  productId: string;
  batchId?: string;
  type: AdjustmentType;
  quantity: number;
  reason?: string;
}

export const recordStockAdjustment = async (
  shopId: string,
  input: RecordStockAdjustmentInput
) => {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, shopId },
  });

  if (!product) {
    const error = new Error('Product not found in this shop') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    if (input.batchId) {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: input.batchId, shopId, productId: input.productId },
      });

      if (!batch) {
        const error = new Error('Inventory batch not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      const delta =
        input.type === AdjustmentType.RETURN ? Math.abs(input.quantity) : input.quantity;

      const updatedQty =
        input.type === AdjustmentType.DAMAGE || input.type === AdjustmentType.LOSS
          ? Math.max(0, batch.quantity - Math.abs(input.quantity))
          : Math.max(0, batch.quantity + delta);

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { quantity: updatedQty },
      });
    } else if (input.type === AdjustmentType.DAMAGE || input.type === AdjustmentType.LOSS) {
      let remainingToDeduct = Math.abs(input.quantity);
      const batches = await tx.inventoryBatch.findMany({
        where: { shopId, productId: input.productId, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
      });

      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;
        const deduct = Math.min(batch.quantity, remainingToDeduct);
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantity: batch.quantity - deduct },
        });
        remainingToDeduct -= deduct;
      }
    }

    return tx.stockAdjustment.create({
      data: {
        shopId,
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });
  });
};

export const getStockAdjustments = async (shopId: string, productId?: string) => {
  return prisma.stockAdjustment.findMany({
    where: {
      shopId,
      ...(productId ? { productId } : {}),
    },
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};
