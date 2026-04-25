export type PaymentStatus = 'pending_payment' | 'paid' | 'cancelled' | 'refunded';
export type FulfillmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type LegacyOrderStatus = 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export function deriveStatusesFromLegacy(status?: string | null): { paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus } {
  switch (status) {
    case 'processing':
      return { paymentStatus: 'paid', fulfillmentStatus: 'processing' };
    case 'shipped':
      return { paymentStatus: 'paid', fulfillmentStatus: 'shipped' };
    case 'delivered':
      return { paymentStatus: 'paid', fulfillmentStatus: 'delivered' };
    case 'paid':
      return { paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' };
    case 'cancelled':
      return { paymentStatus: 'cancelled', fulfillmentStatus: 'cancelled' };
    case 'refunded':
      return { paymentStatus: 'refunded', fulfillmentStatus: 'cancelled' };
    case 'pending_payment':
    default:
      return { paymentStatus: 'pending_payment', fulfillmentStatus: 'unfulfilled' };
  }
}

export function combineOrderStatus(paymentStatus: PaymentStatus, fulfillmentStatus: FulfillmentStatus): LegacyOrderStatus {
  if (paymentStatus === 'refunded') return 'refunded';
  if (paymentStatus === 'cancelled' || fulfillmentStatus === 'cancelled') return 'cancelled';
  if (paymentStatus === 'pending_payment') return 'pending_payment';
  if (fulfillmentStatus === 'delivered') return 'delivered';
  if (fulfillmentStatus === 'shipped') return 'shipped';
  if (fulfillmentStatus === 'processing') return 'processing';
  return 'paid';
}

export function normalizeOrder<T extends { status?: string; paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus }>(order: T) {
  const derived = deriveStatusesFromLegacy(order.status);
  const paymentStatus = order.paymentStatus || derived.paymentStatus;
  const fulfillmentStatus = order.fulfillmentStatus || derived.fulfillmentStatus;

  return {
    ...order,
    paymentStatus,
    fulfillmentStatus,
    status: combineOrderStatus(paymentStatus, fulfillmentStatus),
  };
}
