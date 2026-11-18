import { Router, Request, Response } from 'express';
import authenticateShop from '../../middlewares/auth.middleware';
import { AIService, DashboardPeriod } from './ai.service';

const router = Router();

router.use(authenticateShop);

router.get('/product-performance', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const periodDays = req.query.days ? Number(req.query.days) : 30;
    const data = await AIService.analyzeProductPerformance(shopId, periodDays);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to analyze product performance',
    });
  }
});

router.get('/demand-forecast', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.generateDemandForecasts(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate demand forecasts',
    });
  }
});

router.get('/restock-advisor', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const leadTimeDays = req.query.leadTimeDays
      ? Number(req.query.leadTimeDays)
      : 7;
    const data = await AIService.getRestockingRecommendations(
      shopId,
      leadTimeDays
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate restock recommendations',
    });
  }
});

router.get('/discount-advisor', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const expiryWindowDays = req.query.expiryWindowDays
      ? Number(req.query.expiryWindowDays)
      : 30;
    const data = await AIService.getDiscountRecommendations(
      shopId,
      expiryWindowDays
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate discount recommendations',
    });
  }
});

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const periodParam = String(req.query.period || 'MONTHLY').toUpperCase();
    const validPeriods: DashboardPeriod[] = [
      'DAILY',
      'WEEKLY',
      'MONTHLY',
      'CUSTOM',
    ];
    const period: DashboardPeriod = validPeriods.includes(
      periodParam as DashboardPeriod
    )
      ? (periodParam as DashboardPeriod)
      : 'MONTHLY';

    const startDate = req.query.startDate
      ? String(req.query.startDate)
      : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    const data = await AIService.getBusinessIntelligenceDashboard(
      shopId,
      period,
      startDate,
      endDate
    );
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.message || 'Failed to generate business intelligence dashboard',
    });
  }
});

export const AIRoutes = router;
export default router;
