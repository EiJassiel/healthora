import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AppEnv } from '../../types/hono';
import { Order } from '../../db/models/Order';
import { Product } from '../../db/models/Product';
import { User } from '../../db/models/User';
import { normalizeOrder } from '../../lib/orderStatus';

const paidOrdersMatch = {
  $or: [
    { paymentStatus: 'paid' },
    { paymentStatus: { $exists: false }, status: { $in: ['paid', 'processing', 'shipped', 'delivered'] } },
  ],
};

const nonCancelledOrdersMatch = {
  $or: [
    { paymentStatus: { $ne: 'cancelled' } },
    { paymentStatus: { $exists: false }, status: { $ne: 'cancelled' } },
  ],
};

export const adminDashboardRouter = new Hono<AppEnv>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [totalOrders, monthOrders, lastMonthOrders, totalUsers] = await Promise.all([
      Order.countDocuments(nonCancelledOrdersMatch),
      Order.find({ ...paidOrdersMatch, createdAt: { $gte: startOfMonth } }).lean(),
      Order.find({ ...paidOrdersMatch, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }).lean(),
      User.countDocuments(),
    ]);

    const revenue = monthOrders.reduce((sum: number, order) => sum + ((order as { total?: number }).total || 0), 0);
    const lastRevenue = lastMonthOrders.reduce((sum: number, order) => sum + ((order as { total?: number }).total || 0), 0);
    const revenueDelta = lastRevenue ? Math.round(((revenue - lastRevenue) / lastRevenue) * 100) : 0;

    const dailySales = await Order.aggregate([
      { $match: { ...paidOrdersMatch, createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } } },
      { $group: { _id: { $dateToString: { format: '%m/%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', revenue: 1, orders: 1, _id: 0 } },
    ]);

    const recentOrders = (await Order.find().sort({ createdAt: -1 }).limit(5).lean()).map((order) => normalizeOrder(order));
    const lowStockProducts = await Product.find({ stock: { $lte: 5, $gt: 0 }, active: true }).sort({ stock: 1 }).limit(6).lean();

    return c.json({
      kpis: {
        revenue: Math.round(revenue * 100) / 100,
        revenueDelta,
        totalOrders,
        monthOrders: monthOrders.length,
        totalUsers,
        lowStock: lowStockProducts.length,
      },
      dailySales,
      recentOrders,
      lowStockProducts,
    });
  });
