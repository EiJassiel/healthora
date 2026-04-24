import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '../types';

const GUEST_OWNER = '__guest__';

interface CartState {
  ownerId: string;
  items: CartItem[];
  cartsByOwner: Record<string, CartItem[]>;
  bindOwner: (ownerId: string | null | undefined) => void;
  replaceItems: (items: CartItem[]) => void;
  add: (product: Product, qty?: number) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ownerId: GUEST_OWNER,
      items: [],
      cartsByOwner: {},
      bindOwner: (ownerId) =>
        set((s) => {
          const nextOwnerId = ownerId || GUEST_OWNER;
          const nextCartsByOwner = nextOwnerId === GUEST_OWNER
            ? { ...s.cartsByOwner, [GUEST_OWNER]: [] }
            : s.cartsByOwner;

          return {
            ownerId: nextOwnerId,
            cartsByOwner: nextCartsByOwner,
            items: nextCartsByOwner[nextOwnerId] || [],
          };
        }),
      replaceItems: (items) =>
        set((s) => ({
          items,
          cartsByOwner: { ...s.cartsByOwner, [s.ownerId]: items },
        })),
      add: (product, qty = 1) =>
        set((s) => {
          const ownerItems = s.cartsByOwner[s.ownerId] || [];
          const existing = ownerItems.find((i) => i.product.id === product.id);
          const nextItems = existing
            ? ownerItems.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + qty } : i)
            : [...ownerItems, { product, qty }];

          return {
            items: nextItems,
            cartsByOwner: { ...s.cartsByOwner, [s.ownerId]: nextItems },
          };
        }),
      update: (productId, qty) =>
        set((s) => {
          const ownerItems = s.cartsByOwner[s.ownerId] || [];
          const nextItems = qty <= 0
            ? ownerItems.filter((i) => i.product.id !== productId)
            : ownerItems.map((i) => i.product.id === productId ? { ...i, qty } : i);

          return {
            items: nextItems,
            cartsByOwner: { ...s.cartsByOwner, [s.ownerId]: nextItems },
          };
        }),
      remove: (productId) =>
        set((s) => {
          const nextItems = (s.cartsByOwner[s.ownerId] || []).filter((i) => i.product.id !== productId);

          return {
            items: nextItems,
            cartsByOwner: { ...s.cartsByOwner, [s.ownerId]: nextItems },
          };
        }),
      clear: () =>
        set((s) => ({
          items: [],
          cartsByOwner: { ...s.cartsByOwner, [s.ownerId]: [] },
        })),
      count: () => get().items.reduce((n, i) => n + i.qty, 0),
      subtotal: () => get().items.reduce((n, i) => n + i.product.price * i.qty, 0),
    }),
    { name: 'healthora-cart' }
  )
);
