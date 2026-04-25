import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/hono';
import { clerkAuth } from './clerkAuth';

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const authResponse = await clerkAuth(c, async () => undefined);
  if (authResponse) return authResponse;

  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await next();
});
