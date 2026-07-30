// ============================================================
//  CONTATECK · Backend · Agregados reales del Dashboard
//  OT-0013A · Épica 2: Evolución UX/UI
//
//  Reemplaza el arreglo estático window.KPIS del frontend.
//  Todo se calcula con el mismo patrón de siempre: cliente
//  autenticado como el propio usuario (RLS real), nunca con la
//  service role — así que cada empresa solo ve lo suyo, sin
//  necesidad de filtrar empresa_id a mano aquí.
//
//  IMPORTANTE (alcance aprobado): este módulo NO calcula balance
//  contable (activos/pasivos/capital) ni estimados de IVA/ISR.
//  Esas cifras requieren criterio contable/fiscal real que le
//  corresponde definir al encargado del proyecto — no se inventan
//  aquí. El frontend debe mostrar esos widgets como "Próximamente".
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function clienteComoUsuario(accessToken) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function inicioMes(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1).toISOString();
}

function inicioMesesAtras(n) {
  const hoy = new Date();
  // OJO: hay que fijar el día en 1 ANTES de restar meses. Si se resta
  // sobre el día actual (ej. 30), meses cortos como febrero no tienen
  // "30 de febrero" y JS lo recorre solo al mes siguiente (bug clásico).
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

export async function obtenerDashboard(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase) return { ok: false, error: 'Postgres no está configurado en el backend.' };

  const desdeMesActual = inicioMes();
  const desde6Meses = inicioMesesAtras(6);

  try {
    const [cfdisMes, cfdis6Meses, polizasMes, empleados, cuentas] = await Promise.all([
      supabase.from('cfdis').select('total, tipo, estatus, fecha, cancelled_at, created_at')
        .gte('created_at', desdeMesActual),
      supabase.from('cfdis').select('total, tipo, estatus, created_at')
        .gte('created_at', desde6Meses),
      supabase.from('polizas').select('tipo, monto, estado, fecha')
        .gte('fecha', desdeMesActual.slice(0, 10)),
      supabase.from('empleados').select('sueldo, estado'),
      // OT-0013A: prueba técnica de consulta/relación con cuentas_contables
      // — SOLO conteo neutral (cuántas cuentas hay), cero clasificación.
      // Punto de integración para cuando exista la regla contable real:
      // aquí se agregaría un `select` con el tipo de cuenta ya definido.
      supabase.from('cuentas_contables').select('id', { count: 'exact', head: true }),
    ]);

    if (cfdisMes.error) throw cfdisMes.error;
    if (cfdis6Meses.error) throw cfdis6Meses.error;
    if (polizasMes.error) throw polizasMes.error;
    if (empleados.error) throw empleados.error;
    if (cuentas.error) throw cuentas.error;

    // ---- Facturación del mes ----
    const cfdisIngresoMes = (cfdisMes.data || []).filter((c) => c.tipo === 'I');
    const timbradasMes = cfdisIngresoMes.length;
    const canceladasMes = (cfdisMes.data || []).filter(
      (c) => c.estatus === 'cancelado' && c.cancelled_at && c.cancelled_at >= desdeMesActual
    ).length;
    const montoMes = cfdisIngresoMes
      .filter((c) => c.estatus !== 'cancelado')
      .reduce((acc, c) => acc + (Number(c.total) || 0), 0);

    // ---- Ingresos/Egresos/Utilidad del mes (pólizas) ----
    const polOk = (polizasMes.data || []).filter((p) => p.estado === 'ok');
    const ingresosMes = polOk.filter((p) => p.tipo === 'Ingreso').reduce((a, p) => a + (Number(p.monto) || 0), 0);
    const egresosMes = polOk.filter((p) => p.tipo === 'Egreso').reduce((a, p) => a + (Number(p.monto) || 0), 0);

    // ---- Nómina ----
    const empActivos = (empleados.data || []).filter((e) => e.estado !== 'baja');
    const nominaMensualEstimada = empActivos.reduce((a, e) => a + (Number(e.sueldo) || 0), 0);

    // ---- Serie mensual de facturación real (últimos 6 meses) ----
    const porMes = {};
    (cfdis6Meses.data || [])
      .filter((c) => c.tipo === 'I' && c.estatus !== 'cancelado')
      .forEach((c) => {
        const d = new Date(c.created_at);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        porMes[key] = (porMes[key] || 0) + (Number(c.total) || 0);
      });
    const serieMensual = [];
    const hoy1 = new Date();
    const base1 = new Date(hoy1.getFullYear(), hoy1.getMonth(), 1); // día 1 fijo, evita el desbordamiento
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base1.getFullYear(), base1.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      serieMensual.push({ mes: MESES[d.getMonth()], monto: Math.round((porMes[key] || 0) * 100) / 100 });
    }

    // ---- Alertas reales (nada inventado: solo lo que sí sabemos) ----
    const alertas = [];
    if (canceladasMes > 0) {
      alertas.push({
        tipo: 'warn',
        titulo: `${canceladasMes} CFDI${canceladasMes > 1 ? 's' : ''} cancelado${canceladasMes > 1 ? 's' : ''} este mes`,
        texto: 'Revisa si alguno requiere reexpedirse.',
      });
    }

    return {
      ok: true,
      generadoEn: new Date().toISOString(),
      facturacion: { montoMes, timbradasMes, canceladasMes },
      operacion: { ingresosMes, egresosMes, utilidadMes: ingresosMes - egresosMes },
      nomina: { empleadosActivos: empActivos.length, nominaMensualEstimada },
      serieMensual,
      alertas,
      catalogoContable: { totalCuentas: cuentas.count || 0 }, // neutral, sin clasificar
      // Explícito a propósito: el frontend debe mostrar "Próximamente",
      // nunca inventar un número aquí.
      pendientes: ['balance_contable', 'estimados_fiscales', 'obligaciones_sat'],
    };
  } catch (error) {
    log.warn('[postgres] obtenerDashboard:', error.message);
    return { ok: false, error: error.message };
  }
}
