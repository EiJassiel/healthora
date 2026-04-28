import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

type OrderItem = {
  productId: string;
  productName: string;
  qty: number;
  price: number;
  imageUrl?: string;
  category?: string;
};

type Address = {
  name: string;
  phone: string;
  address: string;
  city: string;
  postal: string;
};

type EmailData = {
  customerName: string;
  customerEmail: string;
  orderId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  address: Address;
  createdAt: Date;
};

function getProductImageUrl(item: OrderItem): string {
  if (item.imageUrl) return item.imageUrl;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5175';
  if (item.category) {
    const url = `${frontendUrl}/products/${item.category}/${item.productId}-1.jpg`;
    console.log('[EMAIL] Image URL:', url);
    return url;
  }
  return `${frontendUrl}/products/${item.productId}-1.jpg`;
}

function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function buildProductRows(items: OrderItem[]): string {
  return items
    .map(
      (item) => `
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #fafafa;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="70" style="vertical-align: middle;">
                <img
                  src="${getProductImageUrl(item)}"
                  alt="${item.productName}"
                  width="70"
                  height="70"
                  style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; display: block; border: 1px solid #e5e7eb;"
                />
              </td>
              <td style="padding-left: 16px; vertical-align: middle;">
                <p style="margin: 0; font-size: 15px; font-weight: 600; color: #1f2937;">${item.productName}</p>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">Cantidad: ${item.qty}</p>
              </td>
              <td align="right" width="100" style="vertical-align: middle;">
                <p style="margin: 0; font-size: 16px; font-weight: 700; color: #059669;">${formatPrice(item.price * item.qty)}</p>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #9ca3af;">${formatPrice(item.price)} c/u</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
    )
    .join('');
}

export async function sendOrderConfirmationEmail(data: EmailData): Promise<void> {
  const { customerName, customerEmail, orderId, items, subtotal, tax, shipping, total, address, createdAt } = data;

  if (!customerEmail) {
    console.error('[EMAIL] No customer email provided, skipping email');
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de tu pedido - Healthora</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0fdf4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4;">
    <tr>
      <td align="center" style="padding: 30px 20px;">
        <table width="650" cellpadding="0" cellspacing="0" border="0" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); overflow: hidden;">

          <!-- Header con gradiente verde -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%); padding: 40px 40px 35px 40px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">¡Gracias por tu compra!</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px; color: #d1fae5;">Hola ${customerName}, tu pedido ha sido confirmado.</p>
                  </td>
                  <td width="60" align="right" style="vertical-align: top;">
                    <div style="width: 50px; height: 50px; background-color: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                      <span style="color: white; font-size: 24px;">✓</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Numero de pedido y fecha -->
          <tr>
            <td style="padding: 30px 40px 20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; border: 1px solid #86efac;">
                <tr>
                  <td style="padding: 20px 25px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td>
                          <p style="margin: 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Número de pedido</p>
                          <p style="margin: 5px 0 0 0; font-size: 22px; font-weight: 700; color: #15803d;">#${orderId.slice(-8).toUpperCase()}</p>
                        </td>
                        <td align="right">
                          <p style="margin: 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Fecha</p>
                          <p style="margin: 5px 0 0 0; font-size: 14px; font-weight: 600; color: #166534;">${formatDate(createdAt)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Productos -->
          <tr>
            <td style="padding: 10px 40px 20px 40px;">
              <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 700; color: #1f2937; padding-bottom: 10px; border-bottom: 2px solid #10b981; display: inline-block;">🛒 Productos adquiridos</h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                ${buildProductRows(items)}
              </table>
            </td>
          </tr>

          <!-- Totales -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 14px 20px; background-color: #f9fafb;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Subtotal</p>
                  </td>
                  <td align="right" style="padding: 14px 20px; background-color: #f9fafb;">
                    <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">${formatPrice(subtotal)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Envío</p>
                  </td>
                  <td align="right" style="padding: 14px 20px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">${formatPrice(shipping)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 20px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">Impuestos (7%)</p>
                  </td>
                  <td align="right" style="padding: 14px 20px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">${formatPrice(tax)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">TOTAL PAGADO</p>
                  </td>
                  <td align="right" style="padding: 18px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">${formatPrice(total)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Direccion de envio -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 700; color: #1f2937; padding-bottom: 10px; border-bottom: 2px solid #10b981; display: inline-block;">📍 Dirección de envío</h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 20px 25px;">
                    <p style="margin: 0; font-size: 16px; color: #1f2937; font-weight: 600;">${address.name}</p>
                    <p style="margin: 6px 0 0 0; font-size: 14px; color: #6b7280;">${address.address}</p>
                    <p style="margin: 3px 0 0 0; font-size: 14px; color: #6b7280;">${address.city}, ${address.postal}</p>
                    <p style="margin: 3px 0 0 0; font-size: 14px; color: #6b7280;">📞 ${address.phone}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Boton CTA -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${process.env.FRONTEND_URL}/orders" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">Ver mi pedido</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Soporte y politiqueas -->
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 25px;">
                    <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 700; color: #1f2937;">¿Necesitas ayuda?</h3>
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      Nuestro equipo de soporte está disponible 24/7 para ayudarte con cualquier duda sobre tu pedido.
                    </p>
                    <p style="margin: 0 0 5px 0; font-size: 14px; color: #374151;">
                      📧 <strong>soporte@healthora.com</strong>
                    </p>
                    <p style="margin: 0 0 15px 0; font-size: 14px; color: #374151;">
                      📞 <strong>+52 800 123 4567</strong>
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                      <strong>Política de devoluciones:</strong> Puedes devolver productos en un plazo de 30 días desde la recepción si el producto está sellado y en su empaque original.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #1f2937;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #ffffff;">Healthora</p>
                    <p style="margin: 0 0 10px 0; font-size: 13px; color: #9ca3af;">
                      Tu salud, nuestra prioridad
                    </p>
                    <p style="margin: 0; font-size: 12px; color: #6b7280;">
                      © 2026 Healthora. Todos los derechos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Healthora <noreply@healthora.com>',
      to: customerEmail,
      subject: `¡Tu pedido #${orderId.slice(-8).toUpperCase()} ha sido confirmado! - Healthora`,
      html,
    });

    console.log('[EMAIL] Order confirmation sent to:', customerEmail, 'MessageId:', info.messageId);
  } catch (err) {
    console.error('[EMAIL] Error sending order confirmation email:', err);
  }
}