// ============================================================
//  CONTATECK · Backend · Timbrado de una nómina completa (OT-0064)
//  Orquesta: por cada renglón sin timbrar arma el CFDI, lo manda al PAC y anota el UUID.
//  Las dependencias se inyectan (así se prueba sin red ni base de datos).
//
//  Reglas de seguridad:
//   · Un renglón que ya tiene UUID NUNCA se vuelve a timbrar.
//   · Un error de datos de UN empleado no detiene a los demás; un error del PAC de tipo sesión/servidor
//     (401, 403, 5xx) sí detiene el lote.
//   · Si el PAC timbró pero no se pudo anotar el UUID, el lote se DETIENE (reintentar duplicaría el timbre)
//     y el UUID se devuelve y se deja en el log para anotarlo a mano.
// ============================================================
import { construirCfdiNomina } from './nominaCfdi.js';

const TOPE_RENGLONES = 500;

// El PAC a veces devuelve su respuesta como JSON crudo dentro de `details` y un genérico "Request failed with
// status code 400" en `message`. Se extrae el mensaje real y, para el rechazo más común (RFC que no existe en el
// listado del SAT, NOM9), se explica en palabras del usuario.
export function mensajeDelPac(r) {
  let msg = String((r && r.message) || '');
  let det = String((r && r.details) || '');
  const crudo = [det, msg].find((s) => s.trim().startsWith('{'));
  if (crudo) {
    try {
      const j = JSON.parse(crudo);
      if (j && typeof j === 'object') { msg = String(j.message || ''); det = String(j.details || ''); }
    } catch (e) { /* no era JSON: se deja el texto tal cual */ }
  }
  if (/^\s*NOM9\b|lista de RFC inscritos/i.test(msg + ' ' + det)) {
    return 'El RFC del empleado no está inscrito en el SAT (el proveedor lo valida contra el listado de RFC vigentes). Revisa el RFC y el nombre del empleado. (NOM9)';
  }
  const texto = [msg, det].filter(Boolean).join(' ').trim();
  return texto || 'El PAC rechazó el timbrado.';
}

// deps: {
//   emisor, cpExpedicion, registroPatronal?, fecha(): string,
//   timbrar(invoice): Promise<{ ok, status?, message?, details?, data? }>,
//   registrar(detalleId, { uuid, fiscalapiId }): Promise<{ ok, error? }>,
//   log?
// }
// datos: { nomina, detalle: [renglones], empleados: [empleados] }
export async function timbrarNomina(datos, deps) {
  const log = deps.log || console;
  const { nomina, detalle, empleados } = datos;
  if (!nomina) return { ok: false, error: 'No encontré esa nómina en tu empresa.' };
  if (!Array.isArray(detalle) || !detalle.length) return { ok: false, error: 'La nómina no tiene empleados.' };
  if (detalle.length > TOPE_RENGLONES) return { ok: false, error: `La nómina tiene más de ${TOPE_RENGLONES} empleados.` };

  if (!deps.registroPatronal) {
    return { ok: false, error: 'Falta el registro patronal del IMSS de la empresa (variable EMISOR_REGISTRO_PATRONAL del servidor); el SAT lo exige en el CFDI de nómina.' };
  }

  const porId = new Map((empleados || []).map((e) => [e.id, e]));
  const resultados = [];
  let detenido = null;

  for (const renglon of detalle) {
    const base = { detalleId: renglon.id, nombre: renglon.nombre };
    if (renglon.cfdi_uuid) { resultados.push({ ...base, estado: 'ya_timbrado', uuid: renglon.cfdi_uuid }); continue; }
    if (detenido) { resultados.push({ ...base, estado: 'omitido', error: detenido }); continue; }

    const empleado = porId.get(renglon.empleado_id);
    if (!empleado) { resultados.push({ ...base, estado: 'error', error: 'El empleado ya no existe en el catálogo; no hay datos fiscales para timbrar.' }); continue; }

    const c = construirCfdiNomina({
      nomina, renglon, empleado, emisor: deps.emisor, cpExpedicion: deps.cpExpedicion,
      fecha: deps.fecha(), registroPatronal: deps.registroPatronal,
    });
    if (!c.ok) { resultados.push({ ...base, estado: 'error', error: c.error }); continue; }

    let r;
    try { r = await deps.timbrar(c.invoice); }
    catch (e) { r = { ok: false, status: 500, message: 'No se pudo contactar al proveedor de timbrado.', details: '' }; }
    if (!r || !r.ok) {
      resultados.push({ ...base, estado: 'error', error: mensajeDelPac(r) });
      const st = Number(r && r.status);
      if (st === 401 || st === 403 || st >= 500) detenido = 'Se detuvo el lote por un error del proveedor de timbrado (' + st + ').';
      continue;
    }

    const data = r.data || {};
    const uuid = data.uuid || data.invoiceUuid || (data.taxStamp && data.taxStamp.uuid) || (data.responses && data.responses[0] && data.responses[0].uuid) || null;
    if (!uuid) {
      log.error('[OT-0064] El PAC respondió sin UUID para el renglón', renglon.id, '(fiscalapi', data.id, ')');
      resultados.push({ ...base, estado: 'error', error: 'El PAC respondió sin UUID; revisa en el proveedor antes de reintentar.' });
      detenido = 'Se detuvo el lote: una respuesta del PAC vino sin UUID.';
      continue;
    }
    let g;
    try { g = await deps.registrar(renglon.id, { uuid, fiscalapiId: data.id || null }); }
    catch (e) { g = { ok: false, error: e && e.message }; }
    if (!g || !g.ok) {
      log.error(`[NÓMINA SIN REGISTRO] UUID ${uuid} (fiscalapi ${data.id}) timbrado pero NO anotado en el renglón ${renglon.id}: ${g && g.error}`);
      resultados.push({ ...base, estado: 'timbrado_sin_registro', uuid, error: 'Quedó timbrado ante el PAC pero no se pudo anotar en el panel (' + ((g && g.error) || 'error desconocido') + '). Anota el UUID.' });
      detenido = 'Se detuvo el lote para no duplicar timbres: un UUID no se pudo anotar.';
      continue;
    }
    resultados.push({ ...base, estado: 'timbrado', uuid });
  }

  const cuenta = (e) => resultados.filter((x) => x.estado === e).length;
  const resumen = {
    total: resultados.length, timbrados: cuenta('timbrado'), yaTimbrados: cuenta('ya_timbrado'),
    errores: cuenta('error') + cuenta('timbrado_sin_registro'), omitidos: cuenta('omitido'),
  };
  return { ok: true, resultados, resumen, detenido };
}
