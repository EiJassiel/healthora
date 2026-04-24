import Elysia from 'elysia';
import { requireAdmin } from '../../middleware/requireAdmin';
import { User } from '../../db/models/User';
import { Order } from '../../db/models/Order';
import { clerk } from '../../lib/clerk';
import { t } from 'elysia';

export const adminUsersRouter = new Elysia({ prefix: '/admin/users' })
  .use(requireAdmin)
  .get('/', async () => {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    const enriched = await Promise.all(
      users.map(async (u) => {
        const orders = await Order.find({ customerId: u.clerkId, status: { $ne: 'cancelled' } }).lean();
        const ltv = orders.reduce((s, o) => s + ((o as { total?: number }).total || 0), 0);
        return { ...u, orderCount: orders.length, ltv: Math.round(ltv * 100) / 100 };
      })
    );
    return enriched;
  })
  .patch('/:id/role', async ({ params, body, set }) => {
    const user = await User.findById(params.id);
    if (!user) {
      set.status = 404;
      return { error: 'Not found' };
    }

    user.role = body.role;
    await user.save();

    try {
      const clerkUser = await clerk.users.getUser(user.clerkId);
      await clerk.users.updateUserMetadata(user.clerkId, {
        publicMetadata: { ...clerkUser.publicMetadata, role: body.role },
      });
    } catch (error) {
      console.error('[ADMIN] Failed to sync Clerk role:', error);
    }

    return { ok: true };
  }, { body: t.Object({ role: t.Union([t.Literal('customer'), t.Literal('admin')]) }) });
