import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../../shared/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'bizmind-ai-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface RegisterShopInput {
  shopName: string;
  currency?: string;
  timezone?: string;
  ownerName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

const generateSlug = (name: string): string => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${base || 'shop'}-${suffix}`;
};

const signToken = (userId: string, shopId: string, role: UserRole): string => {
  return jwt.sign({ userId, shopId, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

export const registerShop = async (input: RegisterShopInput) => {
  const { shopName, currency, timezone, ownerName, email, password } = input;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const error = new Error('An account with this email already exists') as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = generateSlug(shopName);

  const result = await prisma.$transaction(async (tx) => {
    const shop = await tx.shop.create({
      data: {
        name: shopName,
        slug,
        currency: currency || 'USD',
        timezone: timezone || 'UTC',
      },
    });

    const user = await tx.user.create({
      data: {
        shopId: shop.id,
        name: ownerName,
        email,
        passwordHash,
        role: UserRole.OWNER,
      },
    });

    return { shop, user };
  });

  const token = signToken(result.user.id, result.shop.id, result.user.role);

  return {
    token,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      shopId: result.user.shopId,
    },
    shop: result.shop,
  };
};

export const login = async (input: LoginInput) => {
  const { email, password } = input;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { shop: true },
  });

  if (!user || !user.isActive) {
    const error = new Error('Invalid email or password') as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    const error = new Error('Invalid email or password') as Error & {
      statusCode?: number;
    };
    error.statusCode = 401;
    throw error;
  }

  const token = signToken(user.id, user.shopId, user.role);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      shopId: user.shopId,
    },
    shop: user.shop,
  };
};

export const getMe = async (userId: string, shopId: string) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      shopId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      shopId: true,
      createdAt: true,
      shop: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          timezone: true,
        },
      },
    },
  });

  if (!user) {
    const error = new Error('User not found') as Error & {
      statusCode?: number;
    };
    error.statusCode = 404;
    throw error;
  }

  return user;
};
