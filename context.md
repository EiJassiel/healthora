# Contexto Healthora

Documento de referencia rápida para retomar el proyecto sin releer todo el código. Para diagramas completos y esquemas de BD ver [`docs/arquitectura.md`](docs/arquitectura.md).

---

## Qué es

E-commerce académico de farmacia y salud con catálogo real de 200 productos, carrito persistente, pagos por Stripe y panel de administración completo. Monorepo con frontend React y backend Hono corriendo en Bun.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 8 + TypeScript |
| Backend | Hono 4.12 + Bun runtime |
| Base de datos | MongoDB Atlas + Mongoose 9.5 |
| Autenticación | Clerk (React SDK + Backend SDK) |
| Pagos | Stripe + Webhooks |
| Estado cliente | Zustand 5 (carrito) |
| Estado servidor | TanStack Query 5 (productos, órdenes) |
| Gráficas | Recharts 3.8 (admin) |
| Emails | nodemailer (SMTP) |

---

## URLs y Puertos

| Servicio | Local |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:3001` |
| Proxy API (Vite) | `/api/*` → `http://localhost:3001/*` |

URLs autorizadas en Clerk: `http://localhost:5173`, `http://localhost:5175`, `http://localhost:3001`

---

## Zonas Horarias

- **Frontend**: Todas las fechas se muestran en `America/Panama` (Clerk usa por defecto la del navegador).
- **Stripe**: Configurar en Settings → Account details → Timezone: `America/Panama`.

---

## Comandos Clave

```bash
# Levantar todo desde raíz
bun run dev

# Sembrar BD (solo primera vez o cuando se actualicen productos)
cd backend && bun run seed

# Sembrar órdenes de ejemplo
cd backend && bun run seed-orders

# Sembrar reviews de ejemplo
cd backend && bun run seed-reviews

# Webhook de Stripe en local
stripe listen --forward-to http://localhost:3001/webhooks/stripe
```

---

## Configuración de Admin

- Se define en `ADMIN_EMAILS` dentro de `backend/.env`.
- Al hacer login con ese email, `clerkAuth.ts` asigna `role: 'admin'` en MongoDB automáticamente.
- Cambiar `ADMIN_EMAILS` requiere reiniciar el backend y volver a iniciar sesión.
- Alternativamente, el rol se puede cambiar desde el panel admin (`PATCH /admin/users/:id/role`).

---

## Catálogo y Productos

- 200 productos reales en 10 categorías: `cuidado-bebe`, `cuidado-personal`, `fitness`, `fragancias`, `hidratantes`, `maquillaje`, `medicamentos`, `salud-piel`, `suplementos`, `vitaminas`.
- 4 imágenes por producto en `frontend/public/products/<categoria>/<product-id>-N.jpg`.
- El seed hace `updateOne + upsert: true`, es seguro re-ejecutar.
- Los productos tienen: nombre, marca, categoría, necesidad (`need`), precio, stock, beneficios, instrucciones, ingredientes, advertencias, FAQ, imágenes, y más campos descriptivos.
- **Reseñas**: Cada producto puede tener reseñas con rating (1-5), comentario, fecha y datos del usuario. Seed disponible en `seed-reviews.ts`.

---

## Carrito

- **Invitado**: vive solo en Zustand + `localStorage`. No se sincroniza al backend.
- **Autenticado**:
  - Al iniciar sesión, `App.tsx` llama `GET /cart` y reemplaza el estado local con el del servidor.
  - Cada cambio dispara un guardado debounced a `PUT /cart`.
  - Se sincroniza entre dispositivos.
- Los dos carritos (guest y auth) son independientes dentro del store de Zustand.

---

## Checkout y Pagos

Flujo completo:

1. Usuario llena dirección en `Checkout.tsx`.
2. `POST /checkout/session` crea una Stripe Checkout Session con los metadatos embebidos (items, dirección, impuesto, envío).
3. Backend devuelve `{ url }` → frontend redirige a Stripe.
4. Stripe recibe el pago y llama `POST /webhooks/stripe` con `checkout.session.completed`.
5. El webhook crea la orden en MongoDB y decrementa el stock de cada producto.
6. Stripe redirige al usuario a `/?view=success&session_id=<id>`.
7. `Success.tsx` sondea `GET /orders?stripeSessionId=<id>` hasta encontrar la orden.

**Cálculo de totales:**
```
shipping = subtotal >= 50 ? 0 : 6.90
tax      = subtotal * 0.07
total    = subtotal + shipping + tax
```

**Tarjetas de prueba:**
- Aprobada: `4242 4242 4242 4242`
- Rechazada: `4000 0000 0000 0002`

---

## Órdenes — Estados

Dos campos independientes:

| Campo | Valores posibles |
|---|---|
| `paymentStatus` | `pending_payment`, `paid`, `cancelled`, `refunded` |
| `fulfillmentStatus` | `unfulfilled`, `processing`, `shipped`, `delivered`, `cancelled` |

El campo `status` (legacy) se mantiene por compatibilidad pero los estados reales son los dos anteriores.

---

## Panel de Administración

Accesible en `/admin` (ruta protegida por Clerk + validación de rol).

| Sección | Qué hace |
|---|---|
| Dashboard | KPIs (ingresos, órdenes, usuarios, stock bajo), ventas diarias (30 días consecutivos), órdenes recientes |
| Pedidos | Lista todas las órdenes, permite cambiar `fulfillmentStatus` |
| Productos | CRUD completo, eliminación masiva, filtros por categoría |
| Usuarios | Lista con rol asignado, cambiar rol, eliminar usuario local |
| Ventas | Top productos, marcas y categorías por unidades e ingreso |
| Ganancias | Ingreso bruto y neto por mes (gráfico de barras con Recharts) |

---

## Autenticación — Cómo Funciona

- Clerk emite un JWT al usuario tras el login.
- El frontend lo adjunta en `Authorization: Bearer <token>` en cada petición privada.
- `clerkAuth.ts` en el backend verifica el token con el SDK de Clerk.
- Si el usuario no existe en MongoDB, se crea (upsert). Si ya existe, se actualiza nombre y email.
- Si el email está en `ADMIN_EMAILS`, se guarda con `role: 'admin'`.
- `requireAdmin.ts` lee `c.get('user').role` y corta con 403 si no es admin.

---

## Emails (nodemailer)

El sistema envía emails de confirmación usando **nodemailer** con SMTP. Configuración en `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-gmail@gmail.com
SMTP_PASS=contraseña-de-app-de-16-caracteres
SMTP_FROM=Healthora <noreply@healthora.com>
```

Para generar la contraseña de aplicación:
1. Ve a https://myaccount.google.com/security
2. Activa "Verificación en 2 pasos"
3. Busca "Contraseñas de aplicaciones" y genera una para "Correo"

Emails enviados:
- Confirmación de Pedido (al completar compra)
- Actualización de estado de orden (cuando cambia fulfillmentStatus)
- Suscripción al Newsletter

---

## Decisiones Técnicas Relevantes

- **Hono sobre Express/Elysia**: migración realizada para aprovechar el rendimiento en Bun y la API más limpia de contexto.
- **Webhook-first para órdenes**: la orden nunca se crea en el frontend ni al iniciar checkout. Solo existe cuando Stripe confirma el pago. Esto evita órdenes fantasma.
- **Stock real**: el stock se decrementa en el webhook, no en el checkout. Si el webhook falla, el stock no se toca.
- **Carrito separado guest/auth**: evita mezclar ítems entre sesiones de distintos usuarios en el mismo dispositivo.
- **URL-based navigation**: las vistas del frontend se controlan con `?view=` en la URL, lo que permite preservar el estado del catálogo al navegar al detalle y volver.
- **`stripeSessionId` único en órdenes**: índice sparse unique en MongoDB para evitar duplicados si el webhook se dispara dos veces.
- **Gráfica de 30 días**: el backend genera las 30 fechas consecutivamente, fillando con 0 los días sin ventas.

---

## Trabajo Realizado (Historial)

### Backend
- Migración completa de Elysia a Hono.
- Middleware `clerkAuth` con `verifyToken` + upsert automático de usuario.
- Webhook de Stripe con verificación de firma y creación de orden.
- Carrito persistente por usuario (`GET /cart`, `PUT /cart`).
- Separación de `paymentStatus` y `fulfillmentStatus` en órdenes.
- Eliminación de duplicados de usuarios en MongoDB.
- Ajuste de Mongoose: `returnDocument: 'after'` (antes `new: true`).
- Rutas de ventas con agrupación por producto, categoría y marca.
- Rutas de ganancias con desglose mensual.
- Script `cleanupDuplicates.ts` para sanear la colección de usuarios.
- Reseñas de productos (`Review` modelo + rutas CRUD).
- Sistema de emails con nodemailer.
- Gráfica de ingresos 30 días con fill de fechas vacías.

### Frontend
- Catálogo con 200 productos, 10 categorías, paginación y filtros persistentes en URL.
- 4 imágenes reales por producto con carrusel en `ProductDetail.tsx`.
- Checkout con campos de dirección obligatorios.
- Carrito lateral (`CartDrawer.tsx`) con sincronización al backend.
- Panel admin completo: Dashboard, Pedidos, Productos, Usuarios, Ventas, Ganancias.
- Gráficos de ventas diarias y ganancias mensais con Recharts.
- `SignInModal.tsx` para forzar login antes de proceder al pago.
- Página `Club.tsx` de membresía/fidelidad.
- Navegación del catálogo conserva filtro activo y página al volver desde detalle de producto.
- Icono SVG personalizado en el Header.
- Sección de reseñas en `ProductDetail.tsx`.
- Fechas en zona horaria `America/Panama`.

---

## Archivos No Versionados

```
.env, .env.local (sí se versiona .env.example)
.agents/, .claude/, .playwright-mcp/
skills-lock.json
scripts/
tmp/
dist/
node_modules/
```