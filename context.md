# Healthora Context

## Overview

Healthora es un ecommerce académico enfocado en productos de salud, cuidado personal, bebé, skincare, fitness y medicamentos OTC.

## Stack

- Frontend: React 19 + Vite + TypeScript
- Backend: Bun + Hono
- Database: MongoDB Atlas con Mongoose
- Auth: Clerk
- Payments: Stripe
- State/Data: Zustand + TanStack Query

## Structure

- `frontend/`: aplicación cliente en React
- `backend/`: API, autenticación, checkout, modelos y seed
- `README.md`: setup general del proyecto

## Current Setup

- Frontend local: `http://localhost:5173`
- Backend local: `http://localhost:3001`
- Seed command: `cd backend && bun run seed`
- Admin bootstrap: `ADMIN_EMAILS` en `backend/.env`

## Important Notes

- No se deben subir secretos ni archivos de entorno reales.
- Tampoco se deben subir carpetas locales de tooling como `.agents`, `.claude` o `.playwright-mcp`.
- `skills-lock.json` se trata como estado local de herramientas, no como archivo del producto.
- Si se cambia `ADMIN_EMAILS`, hay que reiniciar backend y volver a iniciar sesión.
- Las órdenes se crean solo cuando Stripe confirma pago (webhook `checkout.session.completed`).
- Las órdenes pueden reaparecer si existen sesiones pagadas en Stripe - el sistema las recrea automáticamente.

## Recent Work

### Backend
- Migración completa de Elysia a Hono
- Autenticación con Clerk usando `verifyToken`
- Webhook de Stripe que crea órdenes solo cuando pago es exitoso
- Carrito persistente por usuario con sincronización cross-device
- Orders separation: `paymentStatus` (paid/pending/cancelled/refunded) vs `fulfillmentStatus` (unfulfilled/processing/shipped/delivered)
- Eliminación de duplicados de usuarios en MongoDB
- Fixes de Mongoose: `new: true` → `returnDocument: 'after'` (deprecated warning)
- Ruta de ventas con top-products, top-categories y top-brands agrupados

### Frontend
- Checkout con campos de dirección obligatorios (*)
- Panel admin con:
  - Dashboard con métricas reales
  - Pedidos: cambio de estado de envío con select dropdown
  - Productos: CRUD, bulk delete, filtros por categoría
  - Usuarios: cambio de rol, eliminación local
  - Ventas: tendencia diaria, top productos, top categorías, top marcas
  - Ganancias: revenue bruto/neto, detalle mensual
- Catálogo con búsqueda de marcas con X para limpiar
- Carrito persistente

### Features Clave
- Orders solo se crean después de pago confirmado en Stripe
- Usuario admin se asigna por email en `ADMIN_EMAILS` del `.env`
- Panel admin accesible para usuarios con `role: admin` en Mongo o `ADMIN_EMAILS`
- Categorías y marcas en ventas se agrupan y suman unidades/revenue

## Testing

- Test card (Stripe): 4242 4242 4242 4242
- Test card declined: 4000 0000 0000 0002
- URLs autorizadas en Clerk: `http://localhost:5173`, `http://localhost:5175`, `http://localhost:3001`