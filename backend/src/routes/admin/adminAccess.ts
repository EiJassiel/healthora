import { Hono } from 'hono';
import { clerkAuth } from '../../middleware/clerkAuth';
import type { AppEnv } from '../../types/hono';

export const adminAccessRouter = new Hono<AppEnv>()
  .use('*', clerkAuth)
  .get('/', (c) => {
    const user = c.get('user');
    return c.json({
      allowed: user.role === 'admin',
      role: user.role,
      name: user.name,
      email: user.email,
    });
  });
