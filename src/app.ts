import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import AuthRoutes from './modules/auth/auth.routes';
import InventoryRoutes from './modules/inventory/inventory.routes';
import { AccountingRoutes } from './modules/accounting/accounting.routes';

const app: Application = express();

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'BizMind AI server is running',
  });
});

app.use('/api/v1/auth', AuthRoutes);
app.use('/api/v1/inventory', InventoryRoutes);
app.use('/api/v1/accounting', AccountingRoutes);

export default app;
