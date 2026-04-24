import { useEffect, useMemo, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar, KpiCard, PageHeader, Card, LineChart, BarChart, StatusPill, tableStyle, th, td, trStyle, iconBtnAd } from '../../components/admin';
import { ProductImage } from '../../components/shared/ProductImage';
import { Button } from '../../components/shared/Button';
import { Icon } from '../../components/shared/Icon';
import { api } from '../../lib/api';
import type { Product } from '../../types';

type AdminPage = 'dashboard' | 'orders' | 'products' | 'users' | 'sales' | 'earnings';

interface AdminAppProps {
  onGoToStore: () => void;
}

type AdminAccess = { allowed: boolean; role: string; name?: string; email?: string };
type DashboardData = {
  kpis: { revenue: number; revenueDelta: number; totalOrders: number; monthOrders: number; totalUsers: number; lowStock: number };
  dailySales: { revenue: number; date: string }[];
  recentOrders: AdminOrder[];
  lowStockProducts: Product[];
};
type AdminOrder = { _id: string; customerName?: string; customerEmail?: string; items?: unknown[]; total?: number; status?: string; createdAt?: string };
type AdminUser = { _id: string; name?: string; email?: string; role?: 'customer' | 'admin'; orderCount?: number; ltv?: number; createdAt?: string };
type SalesData = { daily?: { revenue: number; date: string }[]; byCategory?: { productId: string; name: string; category: string; revenue: number; units: number }[]; topProducts?: { _id: string; revenue: number; units: number }[] };
type EarningsData = { monthly?: { month: string; revenue: number; orders: number }[]; summary?: { gross: number; tax: number; shipping: number; fees: number; net: number; orders: number } };

const statusOptions = ['paid', 'processing', 'shipped', 'delivered', 'pending_payment', 'cancelled', 'refunded'];
const statusLabels: Record<string, string> = {
  '': 'Todas',
  paid: 'Pagada',
  processing: 'En preparación',
  shipped: 'Enviada',
  delivered: 'Entregada',
  pending_payment: 'Pendiente',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
};

function useAdminToken() {
  const { getToken } = useAuth();
  return async () => {
    const token = await getToken();
    if (!token) throw new Error('Necesitas iniciar sesión');
    return token;
  };
}

function AdminAccessGate({ onGoToStore }: { onGoToStore: () => void }) {
  const getAdminToken = useAdminToken();
  const { isSignedIn } = useUser();
  const { openSignIn } = useClerk();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-access'],
    queryFn: async () => api.admin.access(await getAdminToken()),
    retry: false,
    enabled: isSignedIn,
  });

  if (!isSignedIn) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--cream-2)', padding: 40 }}>
        <div style={{ maxWidth: 520, background: 'var(--cream)', border: '1px solid var(--ink-06)', borderRadius: 28, padding: 36 }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-60)', marginBottom: 12 }}>Acceso interno</div>
          <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 54, lineHeight: 0.95, letterSpacing: '-0.035em', margin: 0, fontWeight: 400 }}>Panel de <em style={{ color: 'var(--green)' }}>administración</em></h1>
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-60)' }}>Debes iniciar sesión con una cuenta autorizada como admin para continuar.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <Button variant="primary" onClick={() => openSignIn({ redirectUrl: `${window.location.origin}?view=admin` })}>Iniciar sesión como admin</Button>
            <Button variant="outline" onClick={onGoToStore}>Volver a la tienda</Button>
          </div>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--cream-2)' }}>Validando acceso admin…</main>;
  }

  if (error || !data?.allowed) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--cream-2)', padding: 40 }}>
        <div style={{ maxWidth: 520, background: 'var(--cream)', border: '1px solid var(--ink-06)', borderRadius: 28, padding: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: 'oklch(0.93 0.1 30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'oklch(0.5 0.15 30)', marginBottom: 16 }}>
            <Icon name="shield" size={24} />
          </div>
          <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 48, lineHeight: 0.95, letterSpacing: '-0.035em', margin: 0, fontWeight: 400 }}>Acceso <em style={{ color: 'var(--coral)' }}>denegado</em></h1>
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-60)' }}>Tu cuenta no tiene permisos de administrador. Si esta cuenta debería ser admin, agrégala en `ADMIN_EMAILS` del backend o asígnale el rol desde una cuenta admin existente.</p>
          <div style={{ marginTop: 24 }}><Button variant="outline" onClick={onGoToStore}>Volver a la tienda</Button></div>
        </div>
      </main>
    );
  }

  return <AdminPanel access={data} onGoToStore={onGoToStore} />;
}

function AdminPanel({ access, onGoToStore }: { access: AdminAccess; onGoToStore: () => void }) {
  const getAdminToken = useAdminToken();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<AdminPage>('dashboard');
  const [orderFilter, setOrderFilter] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productDrafts, setProductDrafts] = useState<Record<string, { price: number; stock: number; active: boolean }>>({});

  useEffect(() => {
    const saved = localStorage.getItem('healthora_admin_page') as AdminPage | null;
    if (saved) setPage(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('healthora_admin_page', page);
  }, [page]);

  const dashboardQuery = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => api.admin.dashboard(await getAdminToken()) as Promise<DashboardData>,
    staleTime: 60000,
  });
  const ordersQuery = useQuery({
    queryKey: ['admin-orders', orderFilter],
    queryFn: async () => api.admin.orders(await getAdminToken(), orderFilter || undefined) as Promise<AdminOrder[]>,
  });
  const productsQuery = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => api.admin.products.list(await getAdminToken()),
  });
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => api.admin.users(await getAdminToken()) as Promise<AdminUser[]>,
  });
  const salesQuery = useQuery({
    queryKey: ['admin-sales'],
    queryFn: async () => api.admin.sales(await getAdminToken()) as Promise<SalesData>,
  });
  const earningsQuery = useQuery({
    queryKey: ['admin-earnings'],
    queryFn: async () => api.admin.earnings(await getAdminToken()) as Promise<EarningsData>,
  });

  const orderStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => api.admin.patchOrderStatus(id, status, await getAdminToken()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-sales'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-earnings'] });
    },
  });
  const productMutation = useMutation({
    mutationFn: async ({ mongoId, draft }: { mongoId: string; draft: { price: number; stock: number; active: boolean } }) =>
      api.admin.products.update(mongoId, draft, await getAdminToken()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      setEditingProductId(null);
    },
  });
  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'customer' | 'admin' }) => api.admin.updateUserRole(id, role, await getAdminToken()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
  });

  const orders = ordersQuery.data || [];
  const products = productsQuery.data || [];
  const users = usersQuery.data || [];
  const sales = salesQuery.data;
  const earnings = earningsQuery.data;
  const dashboard = dashboardQuery.data;

  const sidebarCounts = useMemo(() => ({
    orders: orders.length,
    products: products.length,
    users: users.length,
  }), [orders.length, products.length, users.length]);

  const categories = [...new Set(products.map((product) => product.category))];

  const beginProductEdit = (product: Product) => {
    setEditingProductId(product._id);
    setProductDrafts((drafts) => ({
      ...drafts,
      [product._id]: { price: product.price, stock: product.stock, active: product.active },
    }));
  };

  const draftFor = (product: Product) => productDrafts[product._id] || { price: product.price, stock: product.stock, active: product.active };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100vh', background: 'var(--cream-2)' }}>
      <Sidebar page={page} setPage={setPage} onGoToStore={onGoToStore} counts={sidebarCounts} adminName={access.name} adminEmail={access.email} />
      <div style={{ padding: '36px 48px 80px', overflow: 'auto' }}>
        {page === 'dashboard' && (
          <>
            <PageHeader kicker="Panel de administración" title={<>Dashboard <em style={{ color: 'var(--green)' }}>Healthora</em></>} sub="Resumen en vivo de ventas, órdenes, usuarios y stock." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <KpiCard mode="dark" label="Ingresos mes" value={dashboard ? `$${dashboard.kpis.revenue.toLocaleString()}` : '—'} delta={dashboard?.kpis.revenueDelta} sub="vs mes anterior" />
              <KpiCard label="Órdenes mes" value={dashboard?.kpis.monthOrders ?? '—'} sub="pagadas o en curso" />
              <KpiCard label="Usuarios" value={dashboard?.kpis.totalUsers ?? '—'} sub="clientes registrados" />
              <KpiCard label="Stock bajo" value={dashboard?.kpis.lowStock ?? '—'} sub="productos ≤5 unidades" />
            </div>
            {dashboard?.dailySales?.length ? (
              <Card title="Ingresos · últimos 30 días" sub="Revenue diario, en USD">
                <LineChart data={dashboard.dailySales} height={240} />
              </Card>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginTop: 24 }}>
              <Card title="Pedidos recientes" sub="Últimas 5 órdenes del ecommerce">
                <table style={tableStyle}>
                  <thead><tr><th style={th}>Orden</th><th style={th}>Cliente</th><th style={th}>Total</th><th style={th}>Estado</th></tr></thead>
                  <tbody>
                    {(dashboard?.recentOrders || []).map((order) => (
                      <tr key={order._id} style={trStyle}>
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{order._id.slice(-8).toUpperCase()}</td>
                        <td style={td}><div style={{ fontWeight: 500 }}>{order.customerName || 'Cliente'}</div><div style={{ fontSize: 11, color: 'var(--ink-60)' }}>{order.customerEmail}</div></td>
                        <td style={{ ...td, fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${(order.total || 0).toFixed(2)}</td>
                        <td style={td}><StatusPill status={order.status || 'pending_payment'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card title="Stock crítico" sub="Productos que requieren reposición">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(dashboard?.lowStockProducts || []).map((product) => (
                    <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 42, height: 48, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--ink-06)' }}><ProductImage product={product} size="xs" /></div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{product.name}</div><div style={{ fontSize: 11, color: 'var(--ink-60)' }}>{product.brand}</div></div>
                      <StatusPill status={`${product.stock} uds`} />
                    </div>
                  ))}
                  {!dashboard?.lowStockProducts?.length && <div style={{ fontSize: 14, color: 'var(--ink-60)' }}>No hay productos en stock crítico.</div>}
                </div>
              </Card>
            </div>
          </>
        )}

        {page === 'orders' && (
          <>
            <PageHeader kicker="Pedidos" title={<>Gestión de <em style={{ color: 'var(--green)' }}>pedidos</em></>} sub="Cambia estados y monitorea el ciclo completo de la orden." />
            <Card pad={0}>
              <div style={{ padding: '20px 24px', display: 'flex', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid var(--ink-06)' }}>
                {['', ...statusOptions].map((status) => (
                  <button key={status} onClick={() => setOrderFilter(status)} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: '1px solid ' + (orderFilter === status ? 'var(--ink)' : 'var(--ink-20)'), background: orderFilter === status ? 'var(--ink)' : 'transparent', color: orderFilter === status ? 'var(--cream)' : 'var(--ink)', fontFamily: '"Geist", sans-serif' }}>{statusLabels[status]}</button>
                ))}
              </div>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Orden</th><th style={th}>Cliente</th><th style={th}>Items</th><th style={th}>Total</th><th style={th}>Estado</th><th style={th}>Fecha</th></tr></thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order._id} style={trStyle}>
                      <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{order._id.slice(-8).toUpperCase()}</td>
                      <td style={td}><div style={{ fontWeight: 500 }}>{order.customerName}</div><div style={{ fontSize: 11, color: 'var(--ink-60)' }}>{order.customerEmail}</div></td>
                      <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{order.items?.length ?? 0}</td>
                      <td style={{ ...td, fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${(order.total || 0).toFixed(2)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <StatusPill status={order.status || 'pending_payment'} />
                          <select value={order.status} onChange={(event) => orderStatusMutation.mutate({ id: order._id, status: event.target.value })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ink-20)', background: 'transparent', fontSize: 12 }}>
                            {statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                          </select>
                        </div>
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--ink-60)', fontFamily: '"JetBrains Mono", monospace' }}>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {page === 'products' && (
          <>
            <PageHeader kicker={`Catálogo · ${products.length} productos`} title={<>Gestión de <em style={{ color: 'var(--green)' }}>productos</em></>} sub="Edita precio, stock y estado activo sin salir del panel." />
            <Card pad={0}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Producto</th><th style={th}>Categoría</th><th style={th}>Precio</th><th style={th}>Stock</th><th style={th}>Estado</th><th style={th}></th></tr></thead>
                <tbody>
                  {products.map((product) => {
                    const draft = draftFor(product);
                    const editing = editingProductId === product._id;

                    return (
                      <tr key={product.id} style={trStyle}>
                        <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 44, height: 50, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--ink-06)' }}><ProductImage product={product} size="xs" /></div><div><div style={{ fontSize: 13, fontWeight: 500 }}>{product.name}</div><div style={{ fontSize: 11, color: 'var(--ink-60)', fontFamily: '"JetBrains Mono", monospace' }}>{product.brand}</div></div></div></td>
                        <td style={{ ...td, fontSize: 12 }}>{product.category}</td>
                        <td style={td}>{editing ? <input type="number" value={draft.price} onChange={(event) => setProductDrafts((drafts) => ({ ...drafts, [product._id]: { ...draft, price: Number(event.target.value) } }))} style={{ width: 100, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ink-20)' }} /> : <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${product.price.toFixed(2)}</div>}</td>
                        <td style={td}>{editing ? <input type="number" value={draft.stock} onChange={(event) => setProductDrafts((drafts) => ({ ...drafts, [product._id]: { ...draft, stock: Number(event.target.value) } }))} style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ink-20)' }} /> : product.stock}</td>
                        <td style={td}>{editing ? <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={draft.active} onChange={(event) => setProductDrafts((drafts) => ({ ...drafts, [product._id]: { ...draft, active: event.target.checked } }))} /> Activo</label> : <StatusPill status={product.active ? 'Activo' : 'Inactivo'} />}</td>
                        <td style={td}>
                          {editing ? (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button variant="primary" size="sm" onClick={() => productMutation.mutate({ mongoId: product._id, draft })}>Guardar</Button>
                              <Button variant="outline" size="sm" onClick={() => setEditingProductId(null)}>Cancelar</Button>
                            </div>
                          ) : (
                            <button style={iconBtnAd} onClick={() => beginProductEdit(product)}><Icon name="settings" size={14} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {categories.map((category) => <StatusPill key={category} status={category} />)}
            </div>
          </>
        )}

        {page === 'users' && (
          <>
            <PageHeader kicker={`Usuarios · ${users.length} cuentas`} title={<>Gestión de <em style={{ color: 'var(--green)' }}>usuarios</em></>} sub="Administra roles locales y sincronízalos con Clerk." />
            <Card pad={0}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Usuario</th><th style={th}>Rol</th><th style={th}>Órdenes</th><th style={th}>LTV</th><th style={th}>Registro</th><th style={th}></th></tr></thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} style={trStyle}>
                      <td style={td}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--green)', color: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Instrument Serif", serif', fontSize: 15 }}>{(user.name || 'U')[0]}</div><div><div style={{ fontSize: 13, fontWeight: 500 }}>{user.name || 'Sin nombre'}</div><div style={{ fontSize: 11, color: 'var(--ink-60)', fontFamily: '"JetBrains Mono", monospace' }}>{user.email}</div></div></div></td>
                      <td style={td}>
                        <select value={user.role || 'customer'} onChange={(event) => roleMutation.mutate({ id: user._id, role: event.target.value as 'customer' | 'admin' })} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ink-20)', background: 'transparent', fontSize: 12 }}>
                          <option value="customer">Customer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{user.orderCount ?? 0}</td>
                      <td style={{ ...td, fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${(user.ltv ?? 0).toFixed(2)}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--ink-60)', fontFamily: '"JetBrains Mono", monospace' }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</td>
                      <td style={td}><StatusPill status={(user.role || 'customer').toUpperCase()} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {page === 'sales' && (
          <>
            <PageHeader kicker="Ventas" title={<>Análisis de <em style={{ color: 'var(--green)' }}>ventas</em></>} sub="Tendencia diaria y productos con mayor ingreso acumulado." />
            {sales?.daily?.length ? <Card title="Tendencia de ventas" sub="Ingresos diarios · últimos 30 días"><LineChart data={sales.daily} height={260} /></Card> : null}
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <Card title="Top productos por revenue" sub="Basado en órdenes pagadas o activas">
                <table style={tableStyle}>
                  <thead><tr><th style={th}>Producto</th><th style={th}>Categoría</th><th style={th}>Unidades</th><th style={th}>Revenue</th></tr></thead>
                  <tbody>
                    {(sales?.byCategory || []).map((row) => (
                      <tr key={row.productId} style={trStyle}>
                        <td style={td}>{row.name}</td>
                        <td style={td}>{row.category}</td>
                        <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{row.units}</td>
                        <td style={{ ...td, fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${row.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card title="Top líneas vendidas" sub="Agrupado por nombre guardado en la orden">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(sales?.topProducts || []).map((row) => (
                    <div key={row._id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--ink-06)' }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{row._id}</div>
                      <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace' }}>{row.units} uds</div>
                      <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${row.revenue.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        {page === 'earnings' && (
          <>
            <PageHeader kicker="Ganancias" title={<>Las <em style={{ color: 'var(--green)' }}>ganancias</em></>} sub="Resumen bruto, neto y evolución mensual del ecommerce." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <KpiCard mode="dark" label="Ingresos brutos" value={earnings?.summary ? `$${earnings.summary.gross.toLocaleString()}` : '—'} />
              <KpiCard label="Impuestos" value={earnings?.summary ? `$${earnings.summary.tax.toFixed(2)}` : '—'} />
              <KpiCard label="Utilidad neta" value={earnings?.summary ? `$${earnings.summary.net.toLocaleString()}` : '—'} />
              <KpiCard label="Comisiones Stripe" value={earnings?.summary ? `$${earnings.summary.fees.toFixed(2)}` : '—'} sub="estimado 2.9%" />
            </div>
            {earnings?.monthly?.length ? <Card title="Ganancias · últimos 6 meses" sub="Revenue mensual en USD"><BarChart data={earnings.monthly.map((item) => ({ date: item.month, revenue: item.revenue }))} height={240} /></Card> : null}
            <Card title="Detalle mensual" sub="Revenue y órdenes por mes" pad={0}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Mes</th><th style={th}>Órdenes</th><th style={th}>Revenue</th></tr></thead>
                <tbody>
                  {(earnings?.monthly || []).map((row) => (
                    <tr key={row.month} style={trStyle}>
                      <td style={td}>{row.month}</td>
                      <td style={{ ...td, fontFamily: '"JetBrains Mono", monospace' }}>{row.orders}</td>
                      <td style={{ ...td, fontFamily: '"Instrument Serif", serif', fontSize: 18 }}>${row.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export function AdminApp({ onGoToStore }: AdminAppProps) {
  return <AdminAccessGate onGoToStore={onGoToStore} />;
}
