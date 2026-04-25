import { Hono } from 'hono';
import { stripe } from '../lib/stripe';
import { Order } from '../db/models/Order';
import { Product } from '../db/models/Product';
import { normalizeOrder } from '../lib/orderStatus';

type CheckoutAddress = {
  name: string;
  phone: string;
  address: string;
  city: string;
  postal: string;
};

type CheckoutCartItem = {
  productId: string;
  qty: number;
};

export const webhooksRouter = new Hono().post('/stripe', async (c) => {
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'Missing signature' }, 400);

  let event;
  try {
    const rawBody = await c.req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const existingOrder = await Order.findOne({ stripeSessionId: session.id }).lean();
    if (!existingOrder) {
      try {
        const metadata = session.metadata || {};
        const cartItems = JSON.parse(metadata.cartItems || '[]') as CheckoutCartItem[];
        const address = JSON.parse(metadata.address || '{}') as CheckoutAddress;

        const productIds = cartItems.map((item) => item.productId);
        const products = await Product.find({ id: { $in: productIds }, active: true }).lean();
        if (products.length !== cartItems.length) {
          console.error('[WEBHOOK] Missing products while creating paid order for session', session.id);
        } else {
          const lineItems = cartItems.map((item) => {
            const product = products.find((entry) => entry.id === item.productId);
            if (!product) throw new Error(`Product not found for ${item.productId}`);
            if (product.stock < item.qty) throw new Error(`Insufficient stock for ${product.name}`);
            return { productId: product.id, productName: product.name, qty: item.qty, price: product.price };
          });

          const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
          const tax = Number(metadata.tax || 0);
          const shipping = Number(metadata.shipping || 0);
          const total = Math.round((subtotal + tax + shipping) * 100) / 100;

          await Order.create({
            customerId: metadata.customerId,
            customerName: metadata.customerName,
            customerEmail: metadata.customerEmail,
            items: lineItems,
            subtotal,
            tax,
            shipping,
            total,
            paymentStatus: 'paid',
            fulfillmentStatus: 'unfulfilled',
            status: 'paid',
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
            address,
          });

          for (const item of lineItems) {
            await Product.findOneAndUpdate({ id: item.productId }, { $inc: { stock: -item.qty } });
          }
        }
      } catch (error) {
        console.error('[WEBHOOK] Failed to create paid order:', error);
      }
    } else {
      const normalizedExisting = normalizeOrder(existingOrder);
      if (normalizedExisting.paymentStatus !== 'paid') {
        await Order.findOneAndUpdate(
          { stripeSessionId: session.id },
          {
            paymentStatus: 'paid',
            fulfillmentStatus: normalizedExisting.fulfillmentStatus,
            status: normalizedExisting.fulfillmentStatus === 'unfulfilled' ? 'paid' : normalizedExisting.status,
            stripePaymentIntentId: session.payment_intent,
          }
        );
      }
    }
  }

  return c.json({ received: true });
});
