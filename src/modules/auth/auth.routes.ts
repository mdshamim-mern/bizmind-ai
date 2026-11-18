import { Router, Request, Response } from 'express';
import { authenticateShop } from '../../middlewares/auth.middleware';
import * as authService from './auth.service';

const router = Router();

router.post('/register-shop', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopName, currency, timezone, ownerName, email, password } = req.body;

    if (!shopName || !ownerName || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'shopName, ownerName, email, and password are required',
      });
      return;
    }

    const result = await authService.registerShop({
      shopName,
      currency,
      timezone,
      ownerName,
      email,
      password,
    });

    res.status(201).json({
      success: true,
      message: 'Shop and owner registered successfully',
      data: result,
    });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to register shop',
    });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
      return;
    }

    const result = await authService.login({ email, password });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to login',
    });
  }
});

router.get('/me', authenticateShop, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, shopId } = req.user!;
    const profile = await authService.getMe(userId, shopId);

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error: unknown) {
    const err = error as Error & { statusCode?: number };
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to fetch user profile',
    });
  }
});

export default router;
