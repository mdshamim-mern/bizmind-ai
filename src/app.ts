import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import AuthRoutes from './modules/auth/auth.routes';
import InventoryRoutes from './modules/inventory/inventory.routes';
import { AccountingRoutes } from './modules/accounting/accounting.routes';
import { AIRoutes } from './modules/ai-engine/ai.routes';

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/', (req: Request, res: Response) => {
res.status(200).json({
success: true,
message: 'BizMind AI server is running',
dashboard: '/dashboard',
});
});

app.get('/dashboard', (req: Request, res: Response) => {
res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.use('/api/v1/auth', AuthRoutes);
app.use('/api/v1/inventory', InventoryRoutes);
app.use('/api/v1/accounting', AccountingRoutes);
app.use('/api/v1/ai', AIRoutes);

export default app;
