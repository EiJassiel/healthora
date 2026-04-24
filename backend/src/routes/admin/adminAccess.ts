import Elysia from 'elysia';
import { clerkAuth } from '../../middleware/clerkAuth';

export const adminAccessRouter = new Elysia({ prefix: '/admin/access' })
  .use(clerkAuth)
  .get('/', ({ user }) => ({
    allowed: user.role === 'admin',
    role: user.role,
    name: user.name,
    email: user.email,
  }));
