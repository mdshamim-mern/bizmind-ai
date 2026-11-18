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

router.get('/waste-rescue', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.getWasteRescuePlan(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate waste rescue plan',
    });
  }
});

router.get('/baki-khata', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.getBakiLedgerAndReminders(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch baki khata ledger',
    });
  }
});

router.post('/baki-khata', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const { customerName, phone, amountBDT, dueDays, note, action } = req.body || {};
    if (!customerName || typeof amountBDT !== 'number') {
      res.status(400).json({
        success: false,
        message: 'customerName and numeric amountBDT are required',
      });
      return;
    }
    const entry = await AIService.addOrUpdateBakiEntry(shopId, {
      customerName: String(customerName),
      phone: phone ? String(phone) : undefined,
      amountBDT,
      dueDays: typeof dueDays === 'number' ? dueDays : undefined,
      note: note ? String(note) : undefined,
      action: action === 'PAY' ? 'PAY' : 'ADD',
    });
    res.status(201).json({ success: true, data: entry });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update baki khata entry',
    });
  }
});

router.post('/chalan-scanner', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const { imageBase64, mimeType, rawText } = req.body || {};
    if (!imageBase64 && !rawText) {
      res.status(400).json({
        success: false,
        message: 'Either imageBase64 or rawText is required',
      });
      return;
    }
    const data = await AIService.scanSupplierChalan(shopId, {
      imageBase64: imageBase64 ? String(imageBase64) : undefined,
      mimeType: mimeType ? String(mimeType) : undefined,
      rawText: rawText ? String(rawText) : undefined,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to scan supplier chalan',
    });
  }
});

router.get('/health-score', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.getBusinessHealthAndAnomalies(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to calculate business health score',
    });
  }
});

router.post('/what-if-simulator', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const { type, pct, budgetBDT } = req.body || {};
    const validTypes = ['DISCOUNT', 'PRICE_CHANGE', 'RESTOCK_BUDGET'];
    const scenarioType = validTypes.includes(type) ? type : 'DISCOUNT';
    const data = await AIService.runWhatIfSimulation(shopId, {
      type: scenarioType,
      pct: typeof pct === 'number' ? pct : undefined,
      budgetBDT: typeof budgetBDT === 'number' ? budgetBDT : undefined,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to run what-if simulation',
    });
  }
});

router.post('/assistant/chat', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const { question, language } = req.body || {};
    if (!question) {
      res.status(400).json({
        success: false,
        message: 'question is required',
      });
      return;
    }
    const lang = language === 'en' ? 'en' : 'bn';
    const data = await AIService.askBusinessAssistant(shopId, String(question), lang);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to get AI assistant response',
    });
  }
});

router.get('/morning-brief', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.getMorningBrief(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate morning brief',
    });
  }
});

router.get('/combo-offers', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.getSmartComboOffers(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate smart combo offers',
    });
  }
});

router.get('/impact-summary', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.user!;
    const data = await AIService.getImpactSummary(shopId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate impact summary',
    });
  }
});

export const AIRoutes = router;
export default router;

