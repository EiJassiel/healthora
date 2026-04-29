import { Hono } from 'hono';
import { sendNewsletterSubscriptionEmail } from '../lib/email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const newsletterRouter = new Hono()
  .post('/subscribe', async (c) => {
    const body = await c.req.json().catch(() => null) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !EMAIL_REGEX.test(email)) {
      return c.json({ error: 'Ingresa un correo válido' }, 400);
    }

    try {
      await sendNewsletterSubscriptionEmail({ email });
      return c.json({ success: true, message: 'Suscripción confirmada' });
    } catch (error) {
      console.error('[NEWSLETTER] Failed to send subscription email:', error);
      return c.json({ error: 'No pudimos enviar el correo de suscripción' }, 500);
    }
  });
