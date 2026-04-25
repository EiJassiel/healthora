import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AppEnv } from '../../types/hono';
import { Product } from '../../db/models/Product';

export const adminProductsRouter = new Hono<AppEnv>()
  .use('*', requireAdmin)
  .get('/', async (c) => c.json(await Product.find().lean()))
  .post('/', async (c) => {
    try {
      const body = await c.req.json<object>();
      const product = await Product.create(body);
      return c.json(product.toObject(), 201);
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        return c.json({ error: 'Ya existe un producto con ese nombre o id.' }, 409);
      }
      return c.json({ error: error instanceof Error ? error.message : 'Error' }, 400);
    }
  })
  .put('/:id', async (c) => {
    try {
      const body = await c.req.json<object>();
      const product = await Product.findByIdAndUpdate(c.req.param('id'), body, { returnDocument: 'after' }).lean();
      if (!product) return c.json({ error: 'Not found' }, 404);
      return c.json(product);
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        return c.json({ error: 'Ya existe un producto con ese nombre o id.' }, 409);
      }
      return c.json({ error: error instanceof Error ? error.message : 'Error' }, 400);
    }
  })
  .delete('/:id', async (c) => {
    await Product.findByIdAndDelete(c.req.param('id'));
    return c.body(null, 204);
  });
