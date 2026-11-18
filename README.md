# BizMind AI

AI-Powered Multi-Shop Business Management, Inventory, POS, and Demand Forecasting Backend built with Node.js, TypeScript, Express, PostgreSQL, and Prisma ORM.

## Architecture Overview

- **Multi-Tenant Shop Isolation**: Every domain model is scoped by `shopId` to ensure strict tenant isolation across shops.
- **Database & ORM**: PostgreSQL powered by Prisma ORM (`prisma/schema.prisma`) with indexed `shopId` foreign keys and relational integrity.
- **Authentication & Authorization**: JWT-based authentication with role-based access control (`auth.middleware.ts`) and bcryptjs password hashing.
- **Modular Structure**: Clean separation of concerns across `src/shared`, `src/middlewares`, and `src/modules`.

## Core Data Models

- **Core & Auth**: `Shop`, `User`
- **Catalog & Inventory**: `Category`, `Supplier`, `Product`, `InventoryBatch`, `StockAdjustment`
- **Transactions**: `Purchase`, `PurchaseItem`, `Sale`, `SaleItem`, `Expense`
- **AI & Analytics**: `DemandForecast`, `AIRecommendation`, `BusinessReport`

## Project Roadmap

- **Step 1**: Project initialization, TypeScript & Vercel setup, PostgreSQL Prisma schema with multi-shop isolation, and JWT authentication module.
- **Step 2**: Product, Category, Supplier, and Inventory Batch CRUD APIs with FIFO/batch tracking.
- **Step 3**: Purchase, Sales POS, Expense tracking, and Stock Adjustment workflows.
- **Step 4**: AI Demand Forecasting, Smart Reorder Recommendations, and Business Analytics Reports.

## Getting Started

1. Install dependencies: `npm install`
2. Configure `DATABASE_URL` and `JWT_SECRET` in `.env`
3. Generate Prisma client: `npx prisma generate`
4. Run migrations: `npx prisma migrate dev`
5. Start development server: `npm run dev`
