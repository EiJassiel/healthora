import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/requireAdmin';
import { Order } from '../../db/models/Order';
import { Product } from '../../db/models/Product';

const adminSalesRouter = new Hono()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]);

    const topProductNames = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.productName', units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]);

    const topCategories = await Order.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: 'id', as: 'prod' } },
      { $unwind: '$prod' },
      { $group: { _id: '$prod.category', units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]);

    const topBrands = await Order.aggregate([
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: 'id', as: 'prod' } },
      { $unwind: '$prod' },
      { $group: { _id: '$prod.brand', units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]);

    const ids = topProducts.map(function(i) { return i._id; });
    const products = await Product.find({ id: { $in: ids } }).select('id name category').lean();
    const map = new Map(products.map(function(p) { return [p.id, p]; }));
    
    const byCategory = topProducts.map(function(item) {
      const p = map.get(item._id);
      return { productId: item._id, name: p ? p.name : 'Unknown', category: p ? p.category : 'None', revenue: item.revenue, units: item.units };
    });

    return c.json({ daily: [], byCategory: byCategory, topProducts: topProductNames, topCategories: topCategories, topBrands: topBrands });
  });

export { adminSalesRouter };