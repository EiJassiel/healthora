// Shared with frontend/src/types/index.ts — keep in sync

export type PaymentStatus = 'pending_payment' | 'paid' | 'cancelled' | 'refunded';

export type FulfillmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface ProductFilters {
  category?: string;
  need?: string;
  brand?: string;
  priceMax?: number;
  sort?: 'price_asc' | 'price_desc' | 'rating' | 'newest';
  inStock?: boolean;
  search?: string;
}
