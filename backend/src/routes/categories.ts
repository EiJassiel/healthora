import { Hono } from 'hono';
import { Category } from '../db/models/Category';

export const categoriesRouter = new Hono().get('/', async (c) => {
  const categories = await Category.find().lean();
  return c.json(categories);
});
