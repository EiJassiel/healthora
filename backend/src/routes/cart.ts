import Elysia, { t } from 'elysia';
import { clerkAuth } from '../middleware/clerkAuth';
import { User } from '../db/models/User';
import { Product } from '../db/models/Product';

const CartItemBody = t.Object({
  productId: t.String(),
  qty: t.Number(),
});

async function buildCartResponse(clerkId: string) {
  const user = await User.findOne({ clerkId }).lean();
  const cart = (user?.cart || []).filter((item) => item.qty > 0);
  const productIds = cart.map((item) => item.productId);
  const products = await Product.find({ id: { $in: productIds }, active: true }).lean();
  const productMap = new Map(products.map((product) => [product.id, product]));

  return cart
    .map((item) => {
      const product = productMap.get(item.productId);
      if (!product) return null;
      return { product, qty: item.qty };
    })
    .filter(Boolean);
}

export const cartRouter = new Elysia({ prefix: '/cart' })
  .use(clerkAuth)
  .get('/', async ({ user }) => buildCartResponse(user.clerkId))
  .put(
    '/',
    async ({ user, body, set }) => {
      const sanitizedItems = body.items
        .map((item) => ({ productId: item.productId, qty: Math.max(0, Math.floor(item.qty)) }))
        .filter((item) => item.qty > 0);

      const uniqueProductIds = [...new Set(sanitizedItems.map((item) => item.productId))];
      const existingProducts = await Product.find({ id: { $in: uniqueProductIds }, active: true }).select('id').lean();
      const validIds = new Set(existingProducts.map((product) => product.id));
      const validItems = sanitizedItems.filter((item) => validIds.has(item.productId));

      const updatedUser = await User.findOneAndUpdate(
        { clerkId: user.clerkId },
        { $set: { cart: validItems } },
        { new: true }
      ).lean();

      if (!updatedUser) {
        set.status = 404;
        return { error: 'User not found' };
      }

      return buildCartResponse(user.clerkId);
    },
    {
      body: t.Object({ items: t.Array(CartItemBody) }),
    }
  );
