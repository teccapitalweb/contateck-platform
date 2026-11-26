// ============================================================
//  CONTATECK · Backend · Indicadores fiscales del Dashboard (OT-0061)
//
//  Dos cifras de REFERENCIA para la tarjeta "Indicadores fiscales":
//   · IVA del mes en curso: trasladado, acreditable y diferencia (misma regla que SAT y Fiscal y el asistente).
//   · ISR estimado del ejercicio: SOLO para el régimen general de personas morales (601): 30% de la utilidad contable
//     acumulada del año (ingresos − costos − gastos). El pago provisional real usa el coeficiente de utilidad, las pérdidas
//     fiscales y las deducciones autorizadas, por eso se presenta como estimado y no como el pago. Para otros regímenes no se
//     calcula: se dice por qué.
//  Los datos se leen con el token del propio usuario (RLS), con las mismas herramientas de solo lectura del asistente.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { crearHerramientasReales } from './iaContable.js';
import { hoyMexico } from './validacionesFiscal.js';

export const TASA_ISR_PERSONAS_MORALES = 0.30;
export const REGIMEN_GENERAL_MORALES = '601';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Función pura: arma los dos indicadores con lo que devolvieron las herramientas. */
export function calcularIndicadores({ iva, saldosAnio, regimen, hoy = hoyMexico() }) {
  const [anio, mes] = hoy.split('-').map(Number);
  const ivaOut = iva && !iva.error
    ? { periodo: `${MESES[mes - 1]} de ${anio}`, trasladado: redondea(iva.trasladado), acreditable: redondea(iva.acreditable), resultado: redondea(iva.resultado) }
    : { error: 'No se pudo calcular el IVA.', ...(iva && iva.error && /Configuración contable/.test(iva.error) ? { detalle: iva.error } : {}) };

  const totales = saldosAnio && !saldosAnio.error ? (saldosAnio.totales_por_digito || {}) : null;
  const reg = regimen == null ? '' : String(regimen).trim();
  let isr;
  if (!totales) isr = { disponible: false, motivo: 'No se pudieron leer las cuentas de ingresos, costos y gastos.' };
  else if (!reg) isr = { disponible: false, motivo: 'Falta el régimen fiscal de la empresa: captúralo en la configuración de la empresa.' };
  else if (reg !== REGIMEN_GENERAL_MORALES) isr = { disponible: false, motivo: `El estimado de ISR solo se calcula para el régimen general de personas morales (601); tu empresa tiene el ${reg}. Consúltalo con tu contador.` };
  else {
    const base = redondea((totales['4'] || 0) - (totales['5'] || 0) - (totales['6'] || 0));
    isr = { disponible: true, anio, base, tasa: TASA_ISR_PERSONAS_MORALES, estimado: base > 0 ? redondea(base * TASA_ISR_PERSONAS_MORALES) : 0 };
  }
  return { iva: ivaOut, isr };
}

const idDeToken = (token) => { try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8')).sub || null; } catch (e) { return null; } };

/** Régimen fiscal de la empresa del usuario (con su token, RLS). */
export async function regimenDeLaEmpresa(token) {
  if (!config.supabase.url || !config.supabase.anonKey) return null;
  const supabase = createClient(config.supabase.url, config.supabase.anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: perfil } = await supabase.from('perfiles').select('empresa_id').eq('id', idDeToken(token)).maybeSingle();
  if (!perfil || !perfil.empresa_id) return null;
  const { data: empresa } = await supabase.from('empresas').select('regimen_fiscal').eq('id', perfil.empresa_id).maybeSingle();
  return empresa ? empresa.regimen_fiscal : null;
}

export async function obtenerIndicadoresFiscales(token, deps = {}) {
  const herramientas = deps.herramientas || crearHerramientasReales(token);
  const hoy = deps.hoy || hoyMexico();
  const [anio, mes] = hoy.split('-').map(Number);
  try {
    const [iva, saldosAnio, regimen] = await Promise.all([
      herramientas.iva_del_periodo({ anio, mes }),
      herramientas.saldos_de_cuentas({ anio }),
      (deps.regimen || regimenDeLaEmpresa)(token),
    ]);
    return { ok: true, ...calcularIndicadores({ iva, saldosAnio, regimen, hoy }), nota: 'Cifras de referencia calculadas con tus pólizas; no sustituyen la revisión de tu contador.' };
  } catch (e) {
    return { ok: false, error: 'No se pudieron calcular los indicadores fiscales.' };
  }
}
