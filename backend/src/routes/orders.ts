import { Hono } from 'hono';
import { clerkAuth } from '../middleware/clerkAuth';
import type { AppEnv } from '../types/hono';
import { Order } from '../db/models/Order';
import { Product } from '../db/models/Product';
import { normalizeOrder } from '../lib/orderStatus';
import { stripe } from '../lib/stripe';
import { sendOrderConfirmationEmail } from '../lib/email';

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

async function createOrderFromPaidSession(stripeSessionId: string, clerkId: string) {
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  if ((session.payment_status !== 'paid' && session.status !== 'complete') || session.metadata?.customerId !== clerkId) {
    return null;
  }

  const metadata = session.metadata || {};
  const cartItems = JSON.parse(metadata.cartItems || '[]') as CheckoutCartItem[];
  const address = JSON.parse(metadata.address || '{}') as CheckoutAddress;
  const productIds = cartItems.map((item) => item.productId);
  const products = await Product.find({ id: { $in: productIds }, active: true }).lean();
  if (products.length !== cartItems.length) return null;

  const lineItems = cartItems.map((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    if (!product) throw new Error(`Product not found for ${item.productId}`);
    if (product.stock < item.qty) throw new Error(`Insufficient stock for ${product.name}`);
    const primaryImage = product.images?.find((img) => img.isPrimary)?.url || product.images?.[0]?.url || product.imageUrl || '';
    return { productId: product.id, productName: product.name, qty: item.qty, price: product.price, imageUrl: primaryImage, category: product.category };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = Number(metadata.tax || 0);
  const shipping = Number(metadata.shipping || 0);
  const total = Math.round((subtotal + tax + shipping) * 100) / 100;

  const existing = await Order.findOne({ stripeSessionId }).lean();
  if (existing) return normalizeOrder(existing);

  const createdOrder = await Order.create({
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
    stripeSessionId,
    stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
    address,
  });

  for (const item of lineItems) {
    await Product.findOneAndUpdate({ id: item.productId }, { $inc: { stock: -item.qty } });
  }

  const customerEmail = metadata.customerEmail || session.customer_email;
  if (customerEmail) {
    try {
      await sendOrderConfirmationEmail({
        customerName: metadata.customerName,
        customerEmail: customerEmail,
        orderId: createdOrder._id.toString(),
        items: lineItems,
        subtotal,
        tax,
        shipping,
        total,
        address,
        createdAt: createdOrder.createdAt,
      });
      console.log('[ORDERS] Confirmation email sent to:', customerEmail);
    } catch (emailError) {
      console.error('[ORDERS] Failed to send confirmation email:', emailError);
    }
  }

  return normalizeOrder(createdOrder.toObject());
}

async function syncOrderPaymentFromStripe(order: Record<string, unknown>) {
  const normalizedOrder = normalizeOrder(order);

  if (!normalizedOrder.stripeSessionId || normalizedOrder.paymentStatus === 'paid') {
    return normalizedOrder;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(normalizedOrder.stripeSessionId);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const updatedOrder = await Order.findByIdAndUpdate(
        normalizedOrder._id,
        {
          paymentStatus: 'paid',
          status: normalizedOrder.fulfillmentStatus === 'unfulfilled' ? 'paid' : normalizedOrder.status,
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        },
        { returnDocument: 'after' }
      ).lean();

      return updatedOrder ? normalizeOrder(updatedOrder) : normalizedOrder;
    }
  } catch (error) {
    console.error('[ORDERS] Failed to sync payment from Stripe:', error);
  }

  return normalizedOrder;
}

export const ordersRouter = new Hono<AppEnv>()
  .use('*', clerkAuth)
  .get('/', async (c) => {
    const stripeSessionId = c.req.query('stripeSessionId');
    const clerkId = c.get('user').clerkId;

    if (stripeSessionId) {
      const order = await Order.findOne({ stripeSessionId, customerId: clerkId }).lean();
      if (order) return c.json(await syncOrderPaymentFromStripe(order));

      try {
        const createdOrder = await createOrderFromPaidSession(stripeSessionId, clerkId);
        return c.json(createdOrder || { error: 'Not found' });
      } catch (error) {
        console.error('[ORDERS] Failed to create order from paid session:', error);
        return c.json({ error: 'Not found' });
      }
    }

    const orders = await Order.find({ customerId: clerkId }).sort({ createdAt: -1 }).lean();
    return c.json(orders.map((order) => normalizeOrder(order)));
  })
  .get('/:id', async (c) => {
    const order = await Order.findById(c.req.param('id')).lean();
    if (!order || (order as { customerId?: string }).customerId !== c.get('user').clerkId) {
      return c.json({ error: 'Not found' }, 404);
    }
    return c.json(normalizeOrder(order));
  });
