import { Router, Request, Response } from 'express';
import { AdjustmentType } from '@prisma/client';
import { authenticateShop } from '../../middlewares/auth.middleware';
import * as inventoryService from './inventory.service';

const router = Router();

router.use(authenticateShop);

router.post('/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }
    const category = await inventoryService.createCategory(shopId, name);
    res.status(201).json({ success: true, data: category });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get('/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const categories = await inventoryService.getCategories(shopId);
    res.status(200).json({ success: true, data: categories });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post('/suppliers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const { name, phone, email, address } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Supplier name is required' });
      return;
    }
    const supplier = await inventoryService.createSupplier(shopId, {
      name,
      phone,
      email,
      address,
    });
    res.status(201).json({ success: true, data: supplier });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get('/suppliers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const suppliers = await inventoryService.getSuppliers(shopId);
    res.status(200).json({ success: true, data: suppliers });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post('/products', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const { categoryId, sku, name, unit, costPrice, sellingPrice, reorderLevel } = req.body;
    if (!sku || !name || costPrice === undefined || sellingPrice === undefined) {
      res.status(400).json({
        success: false,
        message: 'sku, name, costPrice, and sellingPrice are required',
      });
      return;
    }
    const product = await inventoryService.createProduct(shopId, {
      categoryId,
      sku,
      name,
      unit,
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : undefined,
    });
    res.status(201).json({ success: true, data: product });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get('/products', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const products = await inventoryService.getProducts(shopId);
    res.status(200).json({ success: true, data: products });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post('/batches', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const { productId, batchNumber, quantity, costPrice, expiryDate, receivedAt } = req.body;
    if (!productId || !batchNumber || quantity === undefined || costPrice === undefined) {
      res.status(400).json({
        success: false,
        message: 'productId, batchNumber, quantity, and costPrice are required',
      });
      return;
    }
    const batch = await inventoryService.addBatch(shopId, {
      productId,
      batchNumber,
      quantity: Number(quantity),
      costPrice: Number(costPrice),
      expiryDate,
      receivedAt,
    });
    res.status(201).json({ success: true, data: batch });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get('/batches/expiring', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const days = req.query.days ? Number(req.query.days) : 30;
    const batches = await inventoryService.getExpiringBatches(shopId, days);
    res.status(200).json({ success: true, data: batches });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post('/adjustments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const { productId, batchId, type, quantity, reason } = req.body;
    if (!productId || !type || quantity === undefined) {
      res.status(400).json({
        success: false,
        message: 'productId, type, and quantity are required',
      });
      return;
    }
    if (!Object.values(AdjustmentType).includes(type)) {
      res.status(400).json({
        success: false,
        message: 'Invalid adjustment type. Must be DAMAGE, LOSS, CORRECTION, or RETURN',
      });
      return;
    }
    const adjustment = await inventoryService.recordStockAdjustment(shopId, {
      productId,
      batchId,
      type,
      quantity: Number(quantity),
      reason,
    });
    res.status(201).json({ success: true, data: adjustment });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get('/adjustments', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.user!;
    const productId = req.query.productId ? String(req.query.productId) : undefined;
    const adjustments = await inventoryService.getStockAdjustments(shopId, productId);
    res.status(200).json({ success: true, data: adjustments });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

export default router;
