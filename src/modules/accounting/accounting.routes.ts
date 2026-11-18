import { Router, Request, Response } from 'express';
import { authenticateShop } from '../../middlewares/auth.middleware';
import * as accountingService from './accounting.service';

const router = Router();
router.use(authenticateShop);

const parseOptionalDate = (value: unknown): Date | undefined => {
  if (!value || typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

// Sales (FEFO deduction & COGS)
router.post('/sales', async (req: Request, res: Response) => {
  try {
    const { shopId, userId } = req.user!;
    const result = await accountingService.recordSale(shopId, userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

router.get('/sales', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const startDate = parseOptionalDate(req.query.startDate);
    const endDate = parseOptionalDate(req.query.endDate);
    const data = await accountingService.getSales(shopId, startDate, endDate);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// Purchases (Received -> Batch creation, Pending -> Incoming tracking)
router.post('/purchases', async (req: Request, res: Response) => {
  try {
    const { shopId, userId } = req.user!;
    const data = await accountingService.recordPurchase(shopId, {
      ...req.body,
      userId: req.body.userId || userId,
    });
    res.status(201).json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

router.get('/purchases', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const data = await accountingService.getPurchases(shopId, status);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

const handleReceivePurchase = async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await accountingService.receivePendingPurchase(shopId, req.params.id);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

router.patch('/purchases/:id/receive', handleReceivePurchase);
router.post('/purchases/:id/receive', handleReceivePurchase);

// Operating Expenses
router.post('/expenses', async (req: Request, res: Response) => {
  try {
    const { shopId, userId } = req.user!;
    const data = await accountingService.recordExpense(shopId, userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

router.get('/expenses', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const startDate = parseOptionalDate(req.query.startDate);
    const endDate = parseOptionalDate(req.query.endDate);
    const data = await accountingService.getExpenses(shopId, startDate, endDate);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// Financial Reports & Profit Breakdown
router.get('/reports/financial-statement', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const period = (req.query.period as accountingService.StatementPeriod) || 'monthly';
    const customStart = parseOptionalDate(req.query.startDate);
    const customEnd = parseOptionalDate(req.query.endDate);
    const data = await accountingService.getFinancialStatement(
      shopId,
      period,
      customStart,
      customEnd
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

router.get('/reports/profit-breakdown', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const startDate = parseOptionalDate(req.query.startDate);
    const endDate = parseOptionalDate(req.query.endDate);
    const data = await accountingService.getProfitByProductAndCategory(
      shopId,
      startDate,
      endDate
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export const AccountingRoutes = router;
