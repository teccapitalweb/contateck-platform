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
import { obtenerCalendario } from './supabaseFiscal.js';

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
    const [cfdisMes, cfdis6Meses, polizasMes, gastos6Meses, empleados, cuentas, partidas, calendarioSat] = await Promise.all([
      supabase.from('cfdis').select('total, tipo, estatus, fecha, cancelled_at, created_at')
        .gte('created_at', desdeMesActual),
      supabase.from('cfdis').select('total, tipo, estatus, created_at')
        .gte('created_at', desde6Meses),
      supabase.from('polizas').select('tipo, monto, estado, fecha')
        .gte('fecha', desdeMesActual.slice(0, 10)),
      supabase.from('polizas').select('tipo, monto, estado, fecha')
        .eq('tipo', 'Egreso').eq('estado', 'ok')
        .gte('fecha', desde6Meses.slice(0, 10)),
      supabase.from('empleados').select('sueldo, estado'),
      // OT-0013A: prueba técnica de consulta/relación con cuentas_contables
      // — SOLO conteo neutral (cuántas cuentas hay), cero clasificación.
      supabase.from('cuentas_contables').select('id', { count: 'exact', head: true }),
      // Balance General y Composición de gastos: aritmética contable real
      // (no criterio fiscal) usando el Código Agrupador oficial del SAT
      // (100=Activo, 200=Pasivo, 300=Capital, 400=Ingresos, 500=Costos,
      // 600=Gastos) — el mismo catálogo que ya construimos en Contabilidad.
      supabase.from('poliza_partidas')
        .select('debe, haber, cuentas_contables(codigo, nombre, naturaleza), polizas!inner(estado)')
        .eq('polizas.estado', 'ok'),
      obtenerCalendario(accessToken, log, supabase),
    ]);

    if (cfdisMes.error) throw cfdisMes.error;
    if (cfdis6Meses.error) throw cfdis6Meses.error;
    if (polizasMes.error) throw polizasMes.error;
    if (gastos6Meses.error) throw gastos6Meses.error;
    if (empleados.error) throw empleados.error;
    if (cuentas.error) throw cuentas.error;
    if (partidas.error) throw partidas.error;

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

    // ---- Serie mensual real de gastos (mismo patrón que ventas arriba) ----
    const gastosPorMes = {};
    (gastos6Meses.data || []).forEach((p) => {
      const d = new Date(p.fecha);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      gastosPorMes[key] = (gastosPorMes[key] || 0) + (Number(p.monto) || 0);
    });
    const gastosSerieMensual = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base1.getFullYear(), base1.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      gastosSerieMensual.push({ mes: MESES[d.getMonth()], monto: Math.round((gastosPorMes[key] || 0) * 100) / 100 });
    }

    // ---- Alertas reales y accionables (nada inventado, nada solo informativo) ----
    // Cada alerta trae "accion" (a qué vista mandar al usuario si le da
    // clic) — una alerta debe resolverse con un clic, no solo informar.
    const alertas = [];
    if (canceladasMes > 0) {
      alertas.push({
        tipo: 'warn',
        titulo: `${canceladasMes} CFDI${canceladasMes > 1 ? 's' : ''} cancelado${canceladasMes > 1 ? 's' : ''} este mes`,
        texto: 'Revisa si alguno requiere reexpedirse.',
        accion: { vista: 'facturacion' },
      });
    }

    // ---- Balance General y Composición de gastos (aritmética real) ----
    // saldo de cada cuenta = a favor de su propia naturaleza (deudora resta
    // el haber; acreedora resta el debe) — regla contable estándar, no un
    // criterio que varíe por empresa.
    const saldosPorCuenta = {};
    (partidas.data || []).forEach((p) => {
      const c = p.cuentas_contables;
      if (!c || !c.codigo) return;
      const key = c.codigo;
      if (!saldosPorCuenta[key]) saldosPorCuenta[key] = { codigo: c.codigo, nombre: c.nombre, naturaleza: c.naturaleza, saldo: 0 };
      const debe = Number(p.debe) || 0, haber = Number(p.haber) || 0;
      saldosPorCuenta[key].saldo += c.naturaleza === 'deudora' ? (debe - haber) : (haber - debe);
    });
    const cuentasArr = Object.values(saldosPorCuenta);
    const sumaPorPrimerDigito = (d) => cuentasArr.filter((c) => c.codigo.startsWith(d)).reduce((a, c) => a + c.saldo, 0);
    const totalActivo = Math.round(sumaPorPrimerDigito('1') * 100) / 100;
    const totalPasivo = Math.round(sumaPorPrimerDigito('2') * 100) / 100;
    const totalCapital = Math.round(sumaPorPrimerDigito('3') * 100) / 100;
    // Mientras no se hace el cierre del periodo, la ecuación contable
    // completa es Activo = Pasivo + Capital + (Ingresos - Gastos - Costos)
    // — no solo Activo = Pasivo + Capital (eso solo es exacto YA cerrado
    // el periodo, cuando el resultado se traspasó a Capital). Sin esto,
    // cualquier empresa con gastos capturados marcaba "no cuadra" aunque
    // estuviera perfectamente bien.
    const totalIngresos = Math.round(sumaPorPrimerDigito('4') * 100) / 100;
    const totalGastosYCostos = Math.round((sumaPorPrimerDigito('5') + sumaPorPrimerDigito('6')) * 100) / 100;
    const resultadoDelPeriodo = Math.round((totalIngresos - totalGastosYCostos) * 100) / 100;
    const composicionGastos = cuentasArr
      .filter((c) => c.codigo.startsWith('6') && c.saldo !== 0)
      .map((c) => ({ cuenta: c.nombre, codigo: c.codigo, monto: Math.round(c.saldo * 100) / 100 }))
      .sort((a, b) => b.monto - a.monto);

    const cuadraBalance = Math.abs(totalActivo - (totalPasivo + totalCapital + resultadoDelPeriodo)) < 0.01;
    if (!cuadraBalance && (totalActivo || totalPasivo || totalCapital)) {
      alertas.push({
        tipo: 'danger',
        titulo: 'El Balance General no cuadra',
        texto: 'Activo debe ser igual a Pasivo + Capital + Resultado del periodo — revisa el catálogo de cuentas.',
        accion: { vista: 'contabilidad' },
      });
    }

    const oblProximasReales = (calendarioSat && calendarioSat.ok) ? (calendarioSat.proximas || []) : [];
    oblProximasReales.forEach((o) => {
      if (o.diasRestantes < 0) {
        alertas.push({
          tipo: 'danger',
          titulo: `${o.obligacion} vencida (${o.periodo})`,
          texto: `Venció el ${o.fechaVencimiento} y sigue sin presentarse.`,
          accion: { vista: 'sat' },
        });
      } else if (o.diasRestantes <= 5) {
        alertas.push({
          tipo: 'warn',
          titulo: `${o.obligacion} vence en ${o.diasRestantes} día${o.diasRestantes === 1 ? '' : 's'}`,
          texto: `${o.periodo} — fecha límite ${o.fechaVencimiento}.`,
          accion: { vista: 'sat' },
        });
      }
    });

    // Desvío drástico de gastos: mes en curso vs mes anterior, ±50% o más.
    const ultimoGasto = gastosSerieMensual[gastosSerieMensual.length - 1]?.monto || 0;
    const penultimoGasto = gastosSerieMensual[gastosSerieMensual.length - 2]?.monto || 0;
    if (penultimoGasto > 0) {
      const cambioPct = ((ultimoGasto - penultimoGasto) / penultimoGasto) * 100;
      if (Math.abs(cambioPct) >= 50) {
        alertas.push({
          tipo: 'warn',
          titulo: `Los gastos ${cambioPct > 0 ? 'subieron' : 'bajaron'} ${Math.abs(cambioPct).toFixed(0)}% vs el mes anterior`,
          texto: `$${penultimoGasto.toLocaleString('es-MX')} → $${ultimoGasto.toLocaleString('es-MX')}.`,
          accion: { vista: 'contabilidad' },
        });
      }
    }

    return {
      ok: true,
      generadoEn: new Date().toISOString(),
      facturacion: { montoMes, timbradasMes, canceladasMes },
      operacion: { ingresosMes, egresosMes, utilidadMes: ingresosMes - egresosMes },
      nomina: { empleadosActivos: empActivos.length, nominaMensualEstimada },
      serieMensual,
      gastosSerieMensual,
      alertas,
      catalogoContable: { totalCuentas: cuentas.count || 0 }, // neutral, sin clasificar
      balanceGeneral: { totalActivo, totalPasivo, totalCapital, resultadoDelPeriodo, cuadra: cuadraBalance },
      composicionGastos,
      proximasObligacionesSat: (calendarioSat && calendarioSat.ok) ? (calendarioSat.proximas || []).slice(0, 5) : [],
      // Explícito a propósito: el frontend debe mostrar "Próximamente",
      // nunca inventar un número aquí.
      pendientes: ['estimados_fiscales'],
    };
  } catch (error) {
    log.warn('[postgres] obtenerDashboard:', error.message);
    return { ok: false, error: error.message };
  }
}
