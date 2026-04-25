import { Hono } from 'hono';
import { clerkAuth } from '../middleware/clerkAuth';
import type { AppEnv } from '../types/hono';
import { Product } from '../db/models/Product';
import { stripe } from '../lib/stripe';

type CheckoutBody = {
  items: { productId: string; qty: number }[];
  address: { name: string; phone: string; address: string; city: string; postal: string };
};

export const checkoutRouter = new Hono<AppEnv>()
  .use('*', clerkAuth)
  .post('/session', async (c) => {
    const body = await c.req.json<CheckoutBody>();
    const { items, address } = body;
    const user = c.get('user');

    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ id: { $in: productIds }, active: true }).lean();
    if (products.length !== items.length) {
      return c.json({ error: 'One or more products not found' }, 400);
    }

    const lineItems = items.map((item) => {
      const p = products.find((product) => product.id === item.productId);
      if (!p) throw new Error('Product not found');
      if (p.stock < item.qty) throw new Error(`Stock insuficiente para ${p.name}`);
      return { productId: p.id, productName: p.name, qty: item.qty, price: p.price };
    });

    const subtotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = Math.round(subtotal * 0.07 * 100) / 100;
    const shipping = subtotal >= 50 ? 0 : 6.9;

    try {
      const origin = c.req.header('origin');
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: user.email,
        line_items: lineItems.map((i) => ({
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(i.price * 100),
            product_data: { name: i.productName },
          },
          quantity: i.qty,
        })),
        metadata: {
          customerId: user.clerkId,
          customerName: user.name || '',
          customerEmail: user.email || '',
          cartItems: JSON.stringify(items),
          address: JSON.stringify(address),
          tax: String(tax),
          shipping: String(shipping),
        },
        success_url: `${origin}/?view=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?view=checkout`,
      });

      return c.json({ url: session.url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stripe error';
      console.error('[CHECKOUT] Stripe session creation failed:', message);
      return c.json({ error: 'Payment service unavailable', details: message }, 502);
    }
  });
